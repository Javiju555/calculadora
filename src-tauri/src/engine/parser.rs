/// Recursive descent parser.
///
/// Grammar (highest precedence first):
///
///   stmt      = IDENT '=' expr | expr
///   expr      = term (( '+' | '-' ) term)*
///   term      = pow  (( '*' | '/' | '%' ) pow)*
///   pow       = unary ( '^' unary )*          right-associative
///   unary     = '-' unary | postfix
///   postfix   = primary '!'*
///   primary   = NUM | IDENT | IDENT '(' args ')' | '(' expr ')'
///   args      = expr ( ',' expr )*

use super::ast::{Expr, Stmt};
use super::lexer::Tok;

pub struct Parser {
    tokens: Vec<Tok>,
    pos: usize,
}

impl Parser {
    pub fn new(tokens: Vec<Tok>) -> Self {
        Parser { tokens, pos: 0 }
    }

    fn peek(&self) -> &Tok {
        self.tokens.get(self.pos).unwrap_or(&Tok::Eof)
    }

    fn advance(&mut self) -> &Tok {
        let t = self.tokens.get(self.pos).unwrap_or(&Tok::Eof);
        if self.pos < self.tokens.len() {
            self.pos += 1;
        }
        t
    }

    fn expect(&mut self, expected: &Tok) -> Result<(), String> {
        let got = self.advance().clone();
        if std::mem::discriminant(&got) == std::mem::discriminant(expected) {
            Ok(())
        } else {
            Err(format!("Expected {:?}, got {:?}", expected, got))
        }
    }

    /// Parse a full program (multiple statements separated by ; or newline)
    pub fn parse_program(&mut self) -> Result<Vec<Stmt>, String> {
        let mut stmts = Vec::new();
        while *self.peek() != Tok::Eof {
            // skip empty separators
            while *self.peek() == Tok::Semi {
                self.advance();
            }
            if *self.peek() == Tok::Eof {
                break;
            }
            stmts.push(self.parse_stmt()?);
            // optional trailing semicolon
            if *self.peek() == Tok::Semi {
                self.advance();
            }
        }
        Ok(stmts)
    }

    fn parse_stmt(&mut self) -> Result<Stmt, String> {
        // Lookahead: is it  IDENT '='?
        if let Tok::Ident(name) = self.peek().clone() {
            if self.pos + 1 < self.tokens.len() {
                if let Tok::Eq = self.tokens[self.pos + 1] {
                    // consume ident and '='
                    self.advance();
                    self.advance();
                    let rhs = self.parse_expr()?;
                    return Ok(Stmt::Assign(name, rhs));
                }
            }
        }
        Ok(Stmt::Expr(self.parse_expr()?))
    }

    fn parse_expr(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_term()?;
        loop {
            match self.peek() {
                Tok::Plus => {
                    self.advance();
                    left = Expr::Add(Box::new(left), Box::new(self.parse_term()?));
                }
                Tok::Minus => {
                    self.advance();
                    left = Expr::Sub(Box::new(left), Box::new(self.parse_term()?));
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_term(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_pow()?;
        loop {
            match self.peek() {
                Tok::Star => {
                    self.advance();
                    left = Expr::Mul(Box::new(left), Box::new(self.parse_pow()?));
                }
                Tok::Slash => {
                    self.advance();
                    left = Expr::Div(Box::new(left), Box::new(self.parse_pow()?));
                }
                Tok::Percent => {
                    self.advance();
                    left = Expr::Rem(Box::new(left), Box::new(self.parse_pow()?));
                }
                // Implicit multiplication: number immediately followed by ident/lparen
                // e.g.  2pi  2(x+1)  — but NOT if the ident is followed by '='
                // (that would be the next assignment statement, not an operand)
                Tok::Ident(_) => {
                    if self.tokens.get(self.pos + 1) == Some(&Tok::Eq) {
                        break;
                    }
                    left = Expr::Mul(Box::new(left), Box::new(self.parse_pow()?));
                }
                Tok::LParen => {
                    left = Expr::Mul(Box::new(left), Box::new(self.parse_pow()?));
                }
                _ => break,
            }
        }
        Ok(left)
    }

    fn parse_pow(&mut self) -> Result<Expr, String> {
        let base = self.parse_unary()?;
        if let Tok::Caret = self.peek() {
            self.advance();
            // Right-associative: parse another pow
            let exp = self.parse_pow()?;
            Ok(Expr::Pow(Box::new(base), Box::new(exp)))
        } else {
            Ok(base)
        }
    }

    fn parse_unary(&mut self) -> Result<Expr, String> {
        if let Tok::Minus = self.peek() {
            self.advance();
            Ok(Expr::Neg(Box::new(self.parse_unary()?)))
        } else if let Tok::Plus = self.peek() {
            self.advance();
            self.parse_unary()
        } else {
            self.parse_postfix()
        }
    }

    fn parse_postfix(&mut self) -> Result<Expr, String> {
        let mut expr = self.parse_primary()?;
        while let Tok::Bang = self.peek() {
            self.advance();
            expr = Expr::Factorial(Box::new(expr));
        }
        Ok(expr)
    }

    fn parse_primary(&mut self) -> Result<Expr, String> {
        match self.peek().clone() {
            Tok::Num(n) => {
                self.advance();
                Ok(Expr::Num(n))
            }
            Tok::Ident(name) => {
                self.advance();
                if let Tok::LParen = self.peek() {
                    // Function call
                    self.advance(); // consume '('
                    let mut args = Vec::new();
                    if *self.peek() != Tok::RParen {
                        args.push(self.parse_expr()?);
                        while let Tok::Comma = self.peek() {
                            self.advance();
                            args.push(self.parse_expr()?);
                        }
                    }
                    self.expect(&Tok::RParen)?;
                    Ok(Expr::Call(name, args))
                } else {
                    Ok(Expr::Var(name))
                }
            }
            Tok::LParen => {
                self.advance();
                let inner = self.parse_expr()?;
                self.expect(&Tok::RParen)?;
                Ok(inner)
            }
            Tok::LBracket => {
                self.advance(); // consume '['
                let mut rows: Vec<Vec<Expr>> = Vec::new();
                let mut current_row: Vec<Expr> = Vec::new();
                if *self.peek() != Tok::RBracket {
                    current_row.push(self.parse_expr()?);
                    loop {
                        match self.peek().clone() {
                            Tok::Comma => {
                                self.advance();
                                current_row.push(self.parse_expr()?);
                            }
                            Tok::Semi => {
                                self.advance();
                                rows.push(std::mem::take(&mut current_row));
                                if *self.peek() != Tok::RBracket {
                                    current_row.push(self.parse_expr()?);
                                }
                            }
                            _ => break,
                        }
                    }
                    if !current_row.is_empty() {
                        rows.push(current_row);
                    }
                }
                self.expect(&Tok::RBracket)?;
                Ok(Expr::Matrix(rows))
            }
            other => Err(format!("Unexpected token: {:?}", other)),
        }
    }
}

/// Convenience: parse a single expression string
pub fn parse_expr(src: &str) -> Result<Expr, String> {
    use super::lexer::Lexer;
    let mut lex = Lexer::new(src);
    let tokens = lex.tokenize()?;
    let mut parser = Parser::new(tokens);
    let expr = parser.parse_expr()?;
    Ok(expr)
}

/// Convenience: parse a multi-statement program
pub fn parse_program(src: &str) -> Result<Vec<Stmt>, String> {
    use super::lexer::Lexer;
    let mut lex = Lexer::new(src);
    let tokens = lex.tokenize()?;
    let mut parser = Parser::new(tokens);
    parser.parse_program()
}
