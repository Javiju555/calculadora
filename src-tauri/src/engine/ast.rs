/// Abstract Syntax Tree nodes for mathematical expressions.

#[derive(Debug, Clone)]
pub enum Expr {
    /// Numeric literal
    Num(f64),
    /// Variable / constant reference  (e.g. x, pi, e)
    Var(String),
    /// Unary negation
    Neg(Box<Expr>),
    /// Binary operations
    Add(Box<Expr>, Box<Expr>),
    Sub(Box<Expr>, Box<Expr>),
    Mul(Box<Expr>, Box<Expr>),
    Div(Box<Expr>, Box<Expr>),
    Pow(Box<Expr>, Box<Expr>),
    Rem(Box<Expr>, Box<Expr>),
    /// Factorial  n!
    Factorial(Box<Expr>),
    /// Function call  f(a, b, ...)
    Call(String, Vec<Expr>),
    /// Matrix / vector literal  [row0_col0, row0_col1; row1_col0, ...]
    Matrix(Vec<Vec<Expr>>),
}

/// A CAS statement: either a bare expression or an assignment  name = expr
#[derive(Debug, Clone)]
pub enum Stmt {
    Expr(Expr),
    Assign(String, Expr),
}
