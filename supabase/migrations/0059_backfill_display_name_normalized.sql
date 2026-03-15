-- Backfill display_name_normalized with extended accent normalization
UPDATE authors SET display_name_normalized = lower(
  replace(replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(replace(replace(replace(replace(replace(
  replace(replace(replace(
    display_name,
    'ø', 'oe'), 'æ', 'ae'), 'å', 'aa'), 'ö', 'oe'), 'ä', 'ae'), 'ü', 'ue'),
    'ñ', 'n'), 'ç', 'c'), 'é', 'e'), 'è', 'e'), 'ê', 'e'),
    'á', 'a'), 'à', 'a'), 'â', 'a'), 'í', 'i'), 'ì', 'i'),
    'î', 'i'), 'ó', 'o'), 'ò', 'o'), 'ô', 'o'), 'ú', 'u'),
    'ù', 'u'), 'û', 'u'), 'ß', 'ss'), 'ð', 'd'), 'þ', 'th'),
    'ă', 'a')
)
WHERE display_name IS NOT NULL;
