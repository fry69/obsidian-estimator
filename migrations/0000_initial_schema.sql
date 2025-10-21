-- migrations/0000_initial_schema.sql

DROP TABLE IF EXISTS open_prs;
CREATE TABLE open_prs (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    createdAt TEXT NOT NULL
);

DROP TABLE IF EXISTS merged_prs;
CREATE TABLE merged_prs (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    mergedAt TEXT,
    daysToMerge INTEGER
);
