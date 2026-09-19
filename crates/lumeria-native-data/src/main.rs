fn main() {
    if let Err(error) = lumeria_native_data::run() {
        eprintln!("Lumeria native data host failed: {error}");
        std::process::exit(1);
    }
}
