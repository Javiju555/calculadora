mod engine;
pub mod commands;

use commands::{
    calc_eval, cas_exec, cas_clear, cas_vars, cas_set_angle_mode,
    cas_diff, calc_graph_data, cas_integrate, CasSession,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CasSession::default())
        .invoke_handler(tauri::generate_handler![
            calc_eval,
            cas_exec,
            cas_clear,
            cas_vars,
            cas_set_angle_mode,
            cas_diff,
            calc_graph_data,
            cas_integrate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running calculadora");
}
