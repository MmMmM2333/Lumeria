fn main() {
    if let Err(error) = lumeria_lib::run_native_data_host() {
        eprintln!("Lumeria native data host failed: {error}");
        std::process::exit(1);
    }
}
