import { highlightLine, type SyntaxKind } from "../syntax";
import styles from "./SyntaxLine.module.css";

const tokenClass: Partial<Record<SyntaxKind, string>> = {
  keyword: styles.keyword,
  string: styles.string,
  comment: styles.comment,
  number: styles.number,
  literal: styles.literal,
  function: styles.function,
  type: styles.type,
  meta: styles.meta,
};

export function SyntaxLine({ path, text }: { path: string; text: string }) {
  return <>{highlightLine(text, path).map((token, index) => (
    <span key={index} class={tokenClass[token.kind]}>{token.text}</span>
  ))}</>;
}
