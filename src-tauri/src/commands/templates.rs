use std::fs;
use std::path::Path;

#[tauri::command]
pub fn inject_template(
    template_path: String,
    target_path: String,
    variables: Vec<(String, String)>,
    conflict: String,
) -> Result<Vec<String>, String> {
    let mut injected: Vec<String> = vec![];
    copy_dir_recursive(
        Path::new(&template_path),
        Path::new(&target_path),
        &variables,
        &conflict,
        &mut injected,
    )
    .map_err(|e| e.to_string())?;
    Ok(injected)
}

fn copy_dir_recursive(
    src: &Path,
    dst: &Path,
    vars: &[(String, String)],
    conflict: &str,
    injected: &mut Vec<String>,
) -> Result<(), std::io::Error> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name == "template.json" {
            continue;
        }

        let resolved_name = apply_vars(&file_name, vars);
        let dst_path = dst.join(&resolved_name);

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path, vars, conflict, injected)?;
        } else {
            if dst_path.exists() && conflict == "skip" {
                continue;
            }
            let content = fs::read_to_string(&src_path).unwrap_or_default();
            fs::write(&dst_path, apply_vars(&content, vars))?;
            injected.push(dst_path.to_string_lossy().to_string());
        }
    }
    Ok(())
}

fn apply_vars(input: &str, vars: &[(String, String)]) -> String {
    let mut result = input.to_string();
    for (key, value) in vars {
        result = result.replace(&format!("{{{{ {} }}}}", key), value);
    }
    result
}
