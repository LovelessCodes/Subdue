function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function toCsv(rows: string[][]): string {
  const lines = rows.map((row) => row.map(escapeCell).join(','))
  return `${lines.join('\n')}\n`
}

export function parseCsv(text: string): string[][] {
  const source = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  while (i < source.length) {
    const char = source.charAt(i)

    if (quoted) {
      if (char === '"') {
        if (source.charAt(i + 1) === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"') {
      quoted = true
      i += 1
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += char
    i += 1
  }

  row.push(field)
  rows.push(row)

  while (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last && last.length === 1 && last[0] === '') {
      rows.pop()
    } else {
      break
    }
  }

  return rows
}
