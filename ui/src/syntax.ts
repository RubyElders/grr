export type SyntaxKind = "plain" | "keyword" | "string" | "comment" | "number" | "literal" | "function" | "type" | "meta";

export interface SyntaxToken {
  kind: SyntaxKind;
  text: string;
}

type Language = "c" | "script" | "python" | "ruby" | "shell" | "data" | "markup" | "style" | "sql" | "plain";

const keywords: Record<Language, ReadonlySet<string>> = {
  c: words("alignas alignof as async await auto break case catch class concept const constexpr continue crate default delete do else enum extern fn for friend goto if impl import in inline let loop match mod move mutable namespace new noexcept operator override package private protected pub public ref register requires return sizeof static struct switch template this throw trait try typedef typename union unsafe using virtual void volatile where while yield"),
  script: words("as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield"),
  python: words("and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield"),
  ruby: words("alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield"),
  shell: words("case do done elif else esac export fi for function if in local readonly return set then time until while"),
  data: words("true false null"),
  markup: words("doctype"),
  style: words("and from important media not only or supports var"),
  sql: words("all alter and as asc begin between by case commit create delete desc distinct drop else end exists from full group having in inner insert into is join left like limit not null offset on or order outer primary references right rollback select set table then union unique update values when where with"),
  plain: new Set(),
};

const literals = words("false nil null nullptr none true undefined");
const builtInTypes = words("any bool boolean byte char double f32 f64 float i8 i16 i32 i64 int integer isize long never number object short signed str string symbol u8 u16 u32 u64 uint ulong unsigned usize void");

export function languageForPath(path: string): Language {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  if (["c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx", "cs", "go", "java", "kt", "kts", "rs", "swift"].includes(extension)) return "c";
  if (["js", "jsx", "mjs", "cjs", "ts", "tsx", "vue"].includes(extension)) return "script";
  if (["py", "pyi"].includes(extension)) return "python";
  if (["rb", "rake", "gemspec"].includes(extension) || name === "gemfile" || name === "rakefile") return "ruby";
  if (["sh", "bash", "zsh", "fish"].includes(extension) || name === "dockerfile" || name === "makefile") return "shell";
  if (["json", "jsonc", "yaml", "yml", "toml", "ini"].includes(extension)) return "data";
  if (["html", "htm", "xml", "svg", "md", "markdown"].includes(extension)) return "markup";
  if (["css", "scss", "sass", "less"].includes(extension)) return "style";
  if (["sql"].includes(extension)) return "sql";
  return "plain";
}

export function highlightLine(text: string, path: string): SyntaxToken[] {
  const language = languageForPath(path);
  if (language === "plain" || text.length === 0) return [{ kind: "plain", text }];
  const tokens: SyntaxToken[] = [];
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    const whitespace = rest.match(/^\s+/)?.[0];
    if (whitespace) {
      tokens.push({ kind: "plain", text: whitespace });
      index += whitespace.length;
      continue;
    }
    if (isCommentStart(rest, language)) {
      tokens.push({ kind: "comment", text: rest });
      break;
    }
    if (rest.startsWith("/*") || rest.startsWith("<!--")) {
      tokens.push({ kind: "comment", text: rest });
      break;
    }
    if (rest[0] === "#" && language === "c") {
      tokens.push({ kind: "meta", text: rest });
      break;
    }
    const quote = rest[0];
    if (quote === "\"" || quote === "'" || quote === "`") {
      const value = quoted(rest, quote);
      tokens.push({ kind: "string", text: value });
      index += value.length;
      continue;
    }
    const number = rest.match(/^(?:0[xob][0-9a-f_]+|\d(?:[\d_]*\.?[\d_]*)(?:e[+-]?\d+)?)/i)?.[0];
    if (number) {
      tokens.push({ kind: "number", text: number });
      index += number.length;
      continue;
    }
    const variable = rest.match(/^\$[A-Za-z_][\w]*/)?.[0];
    if (variable) {
      tokens.push({ kind: "literal", text: variable });
      index += variable.length;
      continue;
    }
    const identifier = rest.match(/^[A-Za-z_][\w]*/)?.[0];
    if (identifier) {
      const normalized = identifier.toLowerCase();
      const following = rest.slice(identifier.length);
      const kind: SyntaxKind = keywords[language].has(normalized)
        ? "keyword"
        : literals.has(normalized)
          ? "literal"
          : builtInTypes.has(normalized) || /^[A-Z][A-Za-z0-9_]*$/.test(identifier)
            ? "type"
            : /^\s*\(/.test(following)
              ? "function"
              : "plain";
      tokens.push({ kind, text: identifier });
      index += identifier.length;
      continue;
    }
    tokens.push({ kind: "plain", text: rest[0]! });
    index += 1;
  }
  return tokens;
}

function isCommentStart(rest: string, language: Language): boolean {
  if (["c", "script", "style"].includes(language) && rest.startsWith("//")) return true;
  if (["python", "ruby", "shell", "data"].includes(language) && rest.startsWith("#")) return true;
  return language === "sql" && rest.startsWith("--");
}

function quoted(rest: string, quote: string): string {
  let escaped = false;
  for (let index = 1; index < rest.length; index += 1) {
    const character = rest[index]!;
    if (character === quote && !escaped) return rest.slice(0, index + 1);
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }
  return rest;
}

function words(value: string): ReadonlySet<string> {
  return new Set(value.split(" "));
}
