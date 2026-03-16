ALTER TABLE author_events
  ADD COLUMN sequence SERIAL;

ALTER TABLE article_events
  ADD COLUMN sequence SERIAL;
