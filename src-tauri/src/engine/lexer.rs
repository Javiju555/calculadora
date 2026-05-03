/// Lexer / tokenizer for mathematical expressions.
///
/// Supports: numbers (int, float, sci notation), identifiers, operators,
/// parentheses, comma, and Unicode math symbols (×, ÷, −, √, π, τ, °).

#[derive(Debug, Clone, PartialEq)]
pub enum Tok {
    Num(f64),
    Ident(String),
    // Operators
    Plus,
    Minus,
    Star,
    Slash,
    Caret,
    Percent,
    Bang,      // factorial
    // Grouping
    LParen,
    RParen,
    LBracket,   // [  matrix / vector literal
    RBracket,   // ]
    Comma,
    // Equals (for assignment  a = expr)
    Eq,
    // Semicolon (statement separator in CAS mode; row separator inside [...])
    Semi,
    Eof,
}

pub struct Lexer {
    chars: Vec<char>,
    pos: usize,
}

impl Lexer {
    pub fn new(src: &str) -> Self {
        // Normalize Unicode math symbols before tokenising
        let src = src
            .replace('×', "*")
            .replace('÷', "/")
            .replace('−', "-")
            .replace('·', "*")
            .replace('√', "sqrt")
            .replace('π', "pi")
            .replace('τ', "tau")
            .replace('°', "*pi/180")
            // Superscript digits → ^N
            .replace('⁰', "^0").replace('¹', "^1").replace('²', "^2")
            .replace('³', "^3").replace('⁴', "^4").replace('⁵', "^5")
            .replace('⁶', "^6").replace('⁷', "^7").replace('⁸', "^8")
            .replace('⁹', "^9");

        Lexer {
            chars: src.chars().collect(),
            pos: 0,
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn advance(&mut self) -> Option<char> {
        let c = self.chars.get(self.pos).copied();
        self.pos += 1;
        c
    }

    fn skip_ws(&mut self) {
        while self.peek().map(|c| c.is_whitespace()).unwrap_or(false) {
            self.advance();
        }
    }

    fn read_number(&mut self) -> f64 {
        let start = self.pos - 1; // we already consumed first digit ('0'..'9' or '.')
        // Check for 0x / 0b / 0o prefixes
        if self.chars[start] == '0' {
            match self.peek() {
                Some('x') | Some('X') => {
                    self.advance(); // consume 'x'
                    let hex_start = self.pos;
                    while self.peek().map(|c| c.is_ascii_hexdigit()).unwrap_or(false) {
                        self.advance();
                    }
                    let s: String = self.chars[hex_start..self.pos].iter().collect();
                    return u64::from_str_radix(&s, 16).map(|n| n as f64).unwrap_or(f64::NAN);
                }
                Some('b') | Some('B') => {
                    self.advance();
                    let bin_start = self.pos;
                    while self.peek().map(|c| c == '0' || c == '1').unwrap_or(false) {
                        self.advance();
                    }
                    let s: String = self.chars[bin_start..self.pos].iter().collect();
                    return u64::from_str_radix(&s, 2).map(|n| n as f64).unwrap_or(f64::NAN);
                }
                Some('o') | Some('O') => {
                    self.advance();
                    let oct_start = self.pos;
                    while self.peek().map(|c| c.is_ascii_digit() && c < '8').unwrap_or(false) {
                        self.advance();
                    }
                    let s: String = self.chars[oct_start..self.pos].iter().collect();
                    return u64::from_str_radix(&s, 8).map(|n| n as f64).unwrap_or(f64::NAN);
                }
                _ => {}
            }
        }
        // Integer part
        while self.peek().map(|c| c.is_ascii_digit()).unwrap_or(false) {
            self.advance();
        }
        // Fractional part
        if self.peek() == Some('.') {
            self.advance();
            while self.peek().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                self.advance();
            }
        }
        // Scientific notation  e / E  (optionally signed)
        if self.peek().map(|c| c == 'e' || c == 'E').unwrap_or(false) {
            self.advance();
            if self.peek().map(|c| c == '+' || c == '-').unwrap_or(false) {
                self.advance();
            }
            while self.peek().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                self.advance();
            }
        }
        let s: String = self.chars[start..self.pos].iter().collect();
        s.parse().unwrap_or(f64::NAN)
    }

    fn read_ident(&mut self) -> String {
        let start = self.pos - 1;
        while self
            .peek()
            .map(|c| c.is_alphabetic() || c.is_ascii_digit() || c == '_')
            .unwrap_or(false)
        {
            self.advance();
        }
        self.chars[start..self.pos].iter().collect()
    }

    pub fn tokenize(&mut self) -> Result<Vec<Tok>, String> {
        let mut tokens = Vec::new();
        loop {
            self.skip_ws();
            match self.advance() {
                None => {
                    tokens.push(Tok::Eof);
                    break;
                }
                Some(c) => {
                    let tok = match c {
                        '0'..='9' | '.' => Tok::Num(self.read_number()),
                        c if c.is_alphabetic() || c == '_' => Tok::Ident(self.read_ident()),
                        '+' => Tok::Plus,
                        '-' => Tok::Minus,
                        '*' => Tok::Star,
                        '/' => Tok::Slash,
                        '^' => Tok::Caret,
                        '%' => Tok::Percent,
                        '!' => Tok::Bang,
                        '(' => Tok::LParen,
                        ')' => Tok::RParen,
                        '[' => Tok::LBracket,
                        ']' => Tok::RBracket,
                        ',' => Tok::Comma,
                        '=' => Tok::Eq,
                        ';' | '\n' => Tok::Semi,
                        // Superscript digits map to exponents (already normalised elsewhere,
                        // but just in case)
                        other => {
                            return Err(format!("Unexpected character: '{other}'"));
                        }
                    };
                    tokens.push(tok);
                }
            }
        }
        Ok(tokens)
    }
}
