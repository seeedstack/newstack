-- ARCHITECTURE.md §4 (Data Model), PRODUCT.md §5.9. Copied verbatim from the doc's schema block.

-- Source directory category tags: curator-assigned, multi-valued, never derived from
-- coverage_region/language (PRODUCT §5.9). A source can hold 0-6 categories.
CREATE TABLE source_categories (
  source_id UUID NOT NULL REFERENCES sources(id),
  category  TEXT NOT NULL CHECK (category IN ('national','regional','language','business','geopolitical','specialist')),
  PRIMARY KEY (source_id, category)
);
