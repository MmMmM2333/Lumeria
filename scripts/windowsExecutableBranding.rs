//! Build-time PE resources only: application metadata and the configured ICO.
use std::{env, fs, io, os::windows::ffi::OsStrExt, path::Path, ptr};
type Handle = *mut std::ffi::c_void;
#[link(name = "kernel32")]
extern "system" {
    fn LoadLibraryExW(path: *const u16, file: Handle, flags: u32) -> Handle;
    fn FreeLibrary(module: Handle) -> i32;
    fn EnumResourceNamesW(module: Handle, kind: *const u16, callback: unsafe extern "system" fn(Handle, *const u16, *const u16, isize) -> i32, data: isize) -> i32;
    fn EnumResourceLanguagesW(module: Handle, kind: *const u16, name: *const u16, callback: unsafe extern "system" fn(Handle, *const u16, *const u16, u16, isize) -> i32, data: isize) -> i32;
    fn BeginUpdateResourceW(path: *const u16, delete: i32) -> Handle;
    fn UpdateResourceW(update: Handle, kind: *const u16, name: *const u16, language: u16, bytes: *const u8, size: u32) -> i32;
    fn EndUpdateResourceW(update: Handle, discard: i32) -> i32;
}
fn wide(path: &Path) -> Vec<u16> { path.as_os_str().encode_wide().chain(Some(0)).collect() }
fn align(bytes: &mut Vec<u8>) { while bytes.len() % 4 != 0 { bytes.push(0); } }
fn words(text: &str) -> Vec<u8> { text.encode_utf16().chain(Some(0)).flat_map(u16::to_le_bytes).collect() }
fn block(key: &str, value: &[u8], text: bool, children: &[Vec<u8>]) -> Vec<u8> {
    let mut bytes = vec![0, 0];
    bytes.extend_from_slice(&(if text { value.len() / 2 } else { value.len() } as u16).to_le_bytes());
    bytes.extend_from_slice(&(text as u16).to_le_bytes());bytes.extend(words(key));align(&mut bytes);
    bytes.extend(value);
    for child in children { align(&mut bytes);bytes.extend(child); }
    let length = u16::try_from(bytes.len()).expect("version resource too large");
    bytes[..2].copy_from_slice(&length.to_le_bytes());bytes
}
fn version(name: &str, version: &str) -> Vec<u8> {
    let parts: Vec<u16> = version.split('.').map(|s| s.parse().expect("numeric version required")).collect();
    assert_eq!(parts.len(), 3);
    let fixed: Vec<u8> = [0xfeef04bdu32,0x10000,(u32::from(parts[0])<<16)|u32::from(parts[1]),u32::from(parts[2])<<16,
        (u32::from(parts[0])<<16)|u32::from(parts[1]),u32::from(parts[2])<<16,0x3f,0,0x40004,1,0,0,0]
        .iter().flat_map(|v| v.to_le_bytes()).collect();
    let strings: Vec<Vec<u8>> = [("FileDescription","Lumeria"),("ProductName","Lumeria"),
        ("InternalName",name),("OriginalFilename",name),("FileVersion",version),("ProductVersion",version)]
        .iter().map(|(key,value)| block(key,&words(value),true,&[])).collect();
    block("VS_VERSION_INFO",&fixed,false,&[
        block("StringFileInfo",&[],true,&[block("040904B0",&[],true,&strings)]),
        block("VarFileInfo",&[],true,&[block("Translation",&[9,4,0xb0,4],false,&[])])])
}
enum Name { Id(u16), Text(Vec<u16>) }
impl Name {
    unsafe fn copy(value: *const u16) -> Self {
        if value as usize <= 0xffff { return Self::Id(value as u16); }
        let mut text=Vec::new();let mut index=0;
        loop { let ch=*value.add(index);text.push(ch);if ch==0 {break;}index+=1; }
        Self::Text(text)
    }
    fn pointer(&self) -> *const u16 { match self { Self::Id(id)=>*id as *const u16,Self::Text(text)=>text.as_ptr() } }
}
type Resource = (u16,Name,u16);
unsafe extern "system" fn language(_: Handle, kind: *const u16, name: *const u16, lang: u16, data: isize) -> i32 {
    (*(data as *mut Vec<Resource>)).push((kind as u16,Name::copy(name),lang));1
}
unsafe extern "system" fn resource(module: Handle, kind: *const u16, name: *const u16, data: isize) -> i32 {
    EnumResourceLanguagesW(module,kind,name,language,data)
}
fn main() -> Result<(),Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len()!=4 { return Err("usage: windowsExecutableBranding <exe> <ico> <version>".into()); }
    let path=Path::new(&args[1]);let file=path.file_name().unwrap().to_str().ok_or("invalid filename")?;
    let ico=fs::read(&args[2])?;
    if ico.len()<6 || ico[..4]!=[0,0,1,0] { return Err("invalid ICO".into()); }
    let count=u16::from_le_bytes([ico[4],ico[5]]) as usize;
    if count==0 || 6+count*16>ico.len() { return Err("invalid ICO directory".into()); }
    let mut group=ico[..6].to_vec();let mut images=Vec::new();
    for index in 0..count {
        let entry=&ico[6+index*16..6+(index+1)*16];
        let size=u32::from_le_bytes(entry[8..12].try_into()?) as usize;
        let offset=u32::from_le_bytes(entry[12..16].try_into()?) as usize;
        images.push(ico.get(offset..offset.checked_add(size).ok_or("ICO overflow")?).ok_or("invalid ICO image")?);
        group.extend_from_slice(&entry[..12]);group.extend_from_slice(&((index+1) as u16).to_le_bytes());
    }
    let metadata=version(file,&args[3]);let filename=wide(path);
    unsafe {
        let module=LoadLibraryExW(filename.as_ptr(),ptr::null_mut(),2);
        if module.is_null() { return Err(io::Error::last_os_error().into()); }
        let mut previous=Vec::<Resource>::new();
        for kind in [3u16,14,16] {
            let ok=EnumResourceNamesW(module,kind as *const u16,resource,&mut previous as *mut _ as isize);
            if ok==0 {
                let error=io::Error::last_os_error();
                // No resources or no resources of this type is valid for the upstream launcher.
                if !matches!(error.raw_os_error(),Some(1812)|Some(1813)|Some(1814)) { FreeLibrary(module);return Err(error.into()); }
            }
        }
        FreeLibrary(module);
        let update=BeginUpdateResourceW(filename.as_ptr(),0);
        if update.is_null() { return Err(io::Error::last_os_error().into()); }
        let result=(|| -> io::Result<()> {
            let put=|kind:u16,name:*const u16,lang:u16,data:&[u8]| {
                let bytes=if data.is_empty(){ptr::null()}else{data.as_ptr()};
                if UpdateResourceW(update,kind as *const u16,name,lang,bytes,data.len() as u32)==0 { Err(io::Error::last_os_error()) }else{Ok(())}
            };
            for (kind,name,lang) in previous { put(kind,name.pointer(),lang,&[])?; }
            for (index,data) in images.iter().enumerate() { put(3,(index+1) as *const u16,1033,data)?; }
            put(14,1 as *const u16,1033,&group)?;put(16,1 as *const u16,1033,&metadata)
        })();
        if let Err(error)=result { EndUpdateResourceW(update,1);return Err(error.into()); }
        if EndUpdateResourceW(update,0)==0 { return Err(io::Error::last_os_error().into()); }
    }
    println!("Branded {} as Lumeria {}",path.display(),args[3]);Ok(())
}
