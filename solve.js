// A fast drop-in for csv-reader 1.0.0: run(input) returns csv-reader's answer
// for {text, header}, the JSON value {columns, rows, errors}.
//
// Written from the written policy in the kit's RULES.txt: the text is read
// once, left to right, with commas and double quotes. A U+FEFF at the very
// start is dropped. A record ends at LF or CRLF, and a line left with no
// characters is no record. Outside quotes a CR not followed by LF is dropped
// (stray_cr). A field that opens with a quote runs to the next quote that is
// not doubled ("" inside it is one quote, and each CRLF or lone CR inside it
// is read as LF); what follows its closing quote, up to the next comma or line
// break, is appended as it stands (quote_junk, when the field ends); a quote
// that never closes is a literal character, and the text after it is read
// again as unquoted (unterminated_quote). A quote inside an unquoted field is
// a literal character. Fields stay strings, never trimmed or converted.
// columns is the first record when header is true, else null; rows holds the
// records after it (every record when header is false), each padded with ""
// (short_row, with fields: its field count) or cut (long_row, with extra: the
// cut fields) to the first record's width. Each error is {code, line, row},
// in the order met; line is the 1-based line its record starts on (counting
// every LF, CRLF and lone CR inside quotes), row its record's index in rows,
// null for the header.
//
// Speed: one pass, fields taken as slices of the input instead of built a
// character at a time, and no function call per field. Quoted fields find
// their closing quote with indexOf; unquoted fields scan with a tight
// char-code loop that only stops at a comma, LF or CR. Nothing is kept from
// one call to the next; no clock, no randomness, no locale.

const LF = 10;
const CR = 13;
const COMMA = 44;
const QUOTE = 34;
const BOM = 0xFEFF;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let i = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === BOM) i = 1;

  while (true) {
    // Lines with no characters are no records.
    while (i < len) {
      const c = text.charCodeAt(i);
      if (c === LF) {
        i += 1;
        line += 1;
      } else if (c === CR && text.charCodeAt(i + 1) === LF) {
        i += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (i >= len) break;

    // The record being read: the line it starts on and the index in rows it
    // takes (null: the header).
    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    let ended; // 0: comma (the record goes on), 1: line break, 2: end of text
    for (;;) {
      let v;
      ended = undefined;
      let junk = false;
      let added = 0;
      let parts = null; // segments already kept for this field, if more than one
      let segStart = i; // where the segment now being read starts
      if (text.charCodeAt(i) === QUOTE) {
        quoted = true;
        const open = i;
        let seg = i + 1;
        let k = text.indexOf('"', seg);
        while (k !== -1 && text.charCodeAt(k + 1) === QUOTE) {
          if (parts === null) parts = [];
          parts.push(text.slice(seg, k));
          parts.push('"');
          seg = k + 2;
          k = text.indexOf('"', seg);
        }
        if (k === -1) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as an unquoted field.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          parts = ['"'];
          segStart = open + 1;
          i = open + 1;
        } else {
          if (parts === null) v = text.slice(seg, k);
          else {
            parts.push(text.slice(seg, k));
            v = parts.join('');
          }
          // CRLF and a lone CR inside quotes are each one LF.
          if (v.indexOf('\n') !== -1 || v.indexOf('\r') !== -1) {
            let n = 0;
            for (let p = 0; p < v.length; p++) {
              const c = v.charCodeAt(p);
              if (c === CR) {
                n += 1;
                if (v.charCodeAt(p + 1) === LF) p += 1;
              } else if (c === LF) {
                n += 1;
              }
            }
            line += n;
            v = v.replace(/\r\n?/g, '\n');
          }
          i = k + 1;
          if (i >= len) {
            ended = 2;
          } else {
            const c2 = text.charCodeAt(i);
            if (c2 === COMMA) {
              i += 1;
              ended = 0;
            } else if (c2 === LF) {
              i += 1;
              line += 1;
              ended = 1;
            } else if (c2 === CR && text.charCodeAt(i + 1) === LF) {
              i += 2;
              line += 1;
              ended = 1;
            } else {
              // What follows the closing quote is appended as it stands, up
              // to the next comma or line break.
              junk = true;
              parts = [v];
              segStart = i;
            }
          }
        }
      } else {
        quoted = false;
        parts = null;
        segStart = i;
      }
      if (ended === undefined) {
        // Read unquoted characters onto the field up to the next comma or
        // line break: a CR not followed by LF is dropped (stray_cr).
        for (;;) {
          let j = i;
          while (j < len) {
            const c = text.charCodeAt(j);
            if (c === COMMA || c === LF || c === CR) break;
            j += 1;
          }
          if (j >= len) {
            const tail = text.slice(segStart, j);
            added += tail.length;
            v = parts === null ? tail : (parts.push(tail), parts.join(''));
            i = len;
            ended = 2;
            break;
          }
          const c = text.charCodeAt(j);
          if (c === COMMA) {
            const tail = text.slice(segStart, j);
            added += tail.length;
            v = parts === null ? tail : (parts.push(tail), parts.join(''));
            i = j + 1;
            ended = 0;
            break;
          }
          if (c === LF) {
            const tail = text.slice(segStart, j);
            added += tail.length;
            v = parts === null ? tail : (parts.push(tail), parts.join(''));
            i = j + 1;
            line += 1;
            ended = 1;
            break;
          }
          if (text.charCodeAt(j + 1) === LF) {
            const tail = text.slice(segStart, j);
            added += tail.length;
            v = parts === null ? tail : (parts.push(tail), parts.join(''));
            i = j + 2;
            line += 1;
            ended = 1;
            break;
          }
          // A lone CR: dropped, and the field goes on after it.
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          if (parts === null) parts = [];
          parts.push(text.slice(segStart, j));
          added += j - segStart;
          segStart = j + 1;
          i = j + 1;
        }
        if (junk && added > 0) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
      }
      fields.push(v);
      if (ended !== 0) break;
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
