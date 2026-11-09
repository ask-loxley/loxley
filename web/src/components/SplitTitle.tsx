import { Fragment, type CSSProperties } from "react";

type Word = { word: string; em: boolean; index: number };

/** Splits "Answers you can *act* on" into words, marking the ones between asterisks as italic. */
function parse(text: string): Word[][] {
  let index = 0;
  let italic = false;
  return text.split("\n").map((line) =>
    line
      .split(" ")
      .filter(Boolean)
      .map((raw) => {
        if (raw.startsWith("*")) italic = true;
        const w = { word: raw.replace(/\*/g, ""), em: italic, index: index++ };
        if (raw.replace(/[,.!?]+$/, "").endsWith("*")) italic = false;
        return w;
      }),
  );
}

/**
 * A heading whose words rise out of a mask, one after another, once a parent Reveal is shown.
 * Wrap words in *asterisks* for italics (with an underline that draws in), and use "\n" for a line break.
 */
export default function SplitTitle({ text, className = "" }: { text: string; className?: string }) {
  return (
    <h2 className={`${className} split`}>
      {parse(text).map((line, li) => (
        <Fragment key={li}>
          {li > 0 && <br />}
          {line.map((w) => (
            <Fragment key={w.index}>
              <span className="sw">
                <span style={{ "--i": w.index } as CSSProperties}>{w.em ? <em>{w.word}</em> : w.word}</span>
              </span>{" "}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </h2>
  );
}
