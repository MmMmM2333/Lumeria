fn main() {
    let args:Vec<String>=std::env::args().skip(1).collect();
    let result=if args.is_empty(){lumeria_native_data::run()}else{
        #[cfg(windows)]
        {if args.len()==2&&args[0]=="--pipe"{lumeria_native_data::run_pipe(&args[1])}else{Err("Invalid data service arguments".into())}}
        #[cfg(not(windows))]
        {Err("Invalid data service arguments".into())}
    };
    if let Err(error) = result {
        eprintln!("Lumeria native data host failed: {error}");
        std::process::exit(1);
    }
}
