# Locally rendered, deterministic interview screens; no downloads or external fonts.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$fixtures = @(
  @{ Name = 'coding-boundary'; Title = 'JavaScript | sum.js'; Lines = @(
    '// What is wrong with this function?',
    'function sum(values) {',
    '  let total = 0;',
    '  for (let i = 0; i <= values.length; i++) {',
    '    total += values[i];',
    '  }',
    '  return total;',
    '}',
    '',
    'console.log(sum([1, 2, 3])); // expected: 6'
  ) },
  @{ Name = 'coding-duplicates'; Title = 'JavaScript | duplicates.js'; Lines = @(
    '// What is the time complexity?',
    '// How would you improve it?',
    'function hasDuplicate(values) {',
    '  for (let i = 0; i < values.length; i++) {',
    '    for (let j = i + 1; j < values.length; j++) {',
    '      if (values[i] === values[j]) return true;',
    '    }',
    '  }',
    '  return false;',
    '}'
  ) },
  @{ Name = 'coding-sql'; Title = 'SQL | customers.sql'; Lines = @(
    '-- Return customers who have no orders.',
    '-- What is wrong with this NULL comparison?',
    'SELECT c.id, c.name',
    'FROM customers AS c',
    'LEFT JOIN orders AS o',
    '  ON o.customer_id = c.id',
    'WHERE o.id = NULL;',
    '',
    '-- orders.id is a non-null primary key.'
  ) }
)
foreach ($fixture in $fixtures) {
  $bitmap = New-Object Drawing.Bitmap(1280, 720)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $font = New-Object Drawing.Font('Consolas', 22)
  $titleFont = New-Object Drawing.Font('Consolas', 24, ([Drawing.FontStyle]::Bold))
  $brush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(224, 232, 242))
  try {
    $graphics.Clear([Drawing.Color]::FromArgb(21, 36, 56))
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.DrawString($fixture.Title, $titleFont, $brush, 40, 30)
    $y = 110
    foreach ($line in $fixture.Lines) {
      $graphics.DrawString($line, $font, $brush, 40, $y)
      $y += 47
    }
    $bitmap.Save((Join-Path $PSScriptRoot "../../src/main/services/mock-interview/fixtures/$($fixture.Name).png"), [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $brush.Dispose(); $titleFont.Dispose(); $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
  }
}
