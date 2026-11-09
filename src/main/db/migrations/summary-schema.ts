export const summarySearchSchema = `
CREATE VIRTUAL TABLE summaries_fts USING fts5(summary,action_items,content='meetings',content_rowid='id',tokenize='porter unicode61');
INSERT INTO summaries_fts(rowid,summary,action_items) SELECT id,summary,action_items FROM meetings;
CREATE TRIGGER summaries_fts_ai AFTER INSERT ON meetings BEGIN
 INSERT INTO summaries_fts(rowid,summary,action_items) VALUES(new.id,new.summary,new.action_items);
END;
CREATE TRIGGER summaries_fts_ad AFTER DELETE ON meetings BEGIN
 INSERT INTO summaries_fts(summaries_fts,rowid,summary,action_items) VALUES('delete',old.id,old.summary,old.action_items);
END;
CREATE TRIGGER summaries_fts_au AFTER UPDATE OF summary,action_items ON meetings BEGIN
 INSERT INTO summaries_fts(summaries_fts,rowid,summary,action_items) VALUES('delete',old.id,old.summary,old.action_items);
 INSERT INTO summaries_fts(rowid,summary,action_items) VALUES(new.id,new.summary,new.action_items);
END;
`
