use std::{ffi::c_void, fs::File, io::BufReader, os::windows::io::FromRawHandle, ptr, time::{Duration, Instant}};
type Handle = *mut c_void;
#[repr(C)]
struct Security { size: u32, descriptor: Handle, inherit: i32 }
#[link(name="kernel32")]
extern "system" {
    fn CreateNamedPipeW(name:*const u16,open:u32,mode:u32,instances:u32,output:u32,input:u32,timeout:u32,security:*const Security)->Handle;
    fn ConnectNamedPipe(pipe:Handle,overlapped:Handle)->i32;
    fn SetNamedPipeHandleState(pipe:Handle,mode:*const u32,max:*const u32,timeout:*const u32)->i32;
    fn GetLastError()->u32;
    fn LocalFree(memory:Handle)->Handle;
}
#[link(name="advapi32")]
extern "system" { fn ConvertStringSecurityDescriptorToSecurityDescriptorW(value:*const u16,revision:u32,descriptor:*mut Handle,size:*mut u32)->i32; }

pub fn run(name:&str)->Result<(),String>{
    if !name.starts_with(r"\\.\pipe\lumeria-data-") || name.len()>160 { return Err("Invalid data pipe name".into()); }
    let wide:Vec<u16>=name.encode_utf16().chain(Some(0)).collect();
    // Owner-only access; remote clients are rejected independently below.
    let sddl:Vec<u16>="D:P(A;;GA;;;OW)".encode_utf16().chain(Some(0)).collect();
    let mut descriptor=ptr::null_mut();
    if unsafe{ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.as_ptr(),1,&mut descriptor,ptr::null_mut())}==0{return Err(std::io::Error::last_os_error().to_string());}
    let security=Security{size:std::mem::size_of::<Security>() as u32,descriptor,inherit:0};
    let raw=unsafe{CreateNamedPipeW(wide.as_ptr(),3|0x00080000,1|8,1,65536,65536,0,&security)};
    unsafe{LocalFree(descriptor);}
    if raw as isize == -1{return Err(std::io::Error::last_os_error().to_string());}
    let mut pipe=unsafe{File::from_raw_handle(raw)};
    let deadline=Instant::now()+Duration::from_secs(30);
    loop{
        let connected=unsafe{ConnectNamedPipe(raw,ptr::null_mut())};
        let error=unsafe{GetLastError()};
        if connected!=0||error==535{break;}
        if error!=536{return Err(format!("Data pipe connection failed ({error})"));}
        if Instant::now()>=deadline{return Err("Data pipe connection timed out".into());}
        std::thread::sleep(Duration::from_millis(5));
    }
    if unsafe{SetNamedPipeHandleState(raw,&0,ptr::null(),ptr::null())}==0{return Err(std::io::Error::last_os_error().to_string());}
    let input=pipe.try_clone().map_err(|error|error.to_string())?;
    let directory=crate::native_paths::data_directory()?;
    crate::host::run_with_io(BufReader::new(input),&mut pipe,&directory)
}
