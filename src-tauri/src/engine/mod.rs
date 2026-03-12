pub mod ast;
pub mod eval;
pub mod lexer;
pub mod parser;
pub mod symbolic;

pub use eval::{eval_at_x, eval_str, exec_stmts, Scope, Value};
pub use symbolic::{differentiate, pretty_print};
