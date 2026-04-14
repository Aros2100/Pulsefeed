-- Trim specialty_tag prompt to binary integer output (remove confidence + reason)
UPDATE model_versions
SET prompt_text =
  left(prompt_text, strpos(prompt_text, E'\n\nRespond in JSON format only:') - 1)
  || E'\n\nRespond in JSON format only:\n{ "decision": 1 } if the article is within the specialty\n{ "decision": 0 } if the article is outside the specialty'
WHERE specialty = 'neurosurgery'
  AND module    = 'specialty_tag'
  AND active    = true;
