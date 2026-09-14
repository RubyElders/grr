import { Component } from "preact";
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

interface SyntaxMatch {
  start: number;
  end: number;
  index: number;
}

interface SyntaxLineProps {
  path: string;
  text: string;
  matches?: ReadonlyArray<SyntaxMatch>;
  activeMatchIndex?: number;
}

export class SyntaxLine extends Component<SyntaxLineProps> {
  shouldComponentUpdate(next: SyntaxLineProps) {
    return next.path !== this.props.path
      || next.text !== this.props.text
      || next.matches !== this.props.matches
      || next.activeMatchIndex !== this.props.activeMatchIndex;
  }

  render({ path, text, matches = [], activeMatchIndex = -1 }: SyntaxLineProps) {
    let offset = 0;
    return <>{highlightLine(text, path).map((token, index) => {
      const start = offset;
      offset += token.text.length;
      return (
        <span key={index} class={tokenClass[token.kind]}>
          {splitToken(token.text, start, matches, activeMatchIndex)}
        </span>
      );
    })}</>;
  }
}

function splitToken(text: string, tokenStart: number, matches: ReadonlyArray<SyntaxMatch>, activeMatchIndex: number) {
  const tokenEnd = tokenStart + text.length;
  const boundaries = new Set([tokenStart, tokenEnd]);
  for (const match of matches) {
    if (match.end <= tokenStart || match.start >= tokenEnd) continue;
    boundaries.add(Math.max(tokenStart, match.start));
    boundaries.add(Math.min(tokenEnd, match.end));
  }
  const points = [...boundaries].sort((left, right) => left - right);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1]!;
    const value = text.slice(start - tokenStart, end - tokenStart);
    const match = matches.find((candidate) => candidate.start < end && candidate.end > start);
    return match ? (
      <mark
        key={start}
        class={`${styles.match} ${match.index === activeMatchIndex ? styles.activeMatch : ""}`}
        data-search-match={match.index}
      >{value}</mark>
    ) : value;
  });
}
