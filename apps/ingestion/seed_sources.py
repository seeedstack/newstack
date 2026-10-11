"""One-time/idempotent seed of Phase 1's starter outlets. Safe to re-run — ON CONFLICT
(domain) is a no-op, so this can be run on every deploy without duplicating rows."""
from __future__ import annotations

import psycopg

import db

SOURCES = [
    dict(name="The Hindu", domain="thehindu.com", country_code="IN", coverage_region="domestic",
         language="en", feed_timezone="Asia/Kolkata", adapter="generic",
         rss_url="https://www.thehindu.com/news/national/feeder/default.rss"),
    dict(name="Times of India", domain="timesofindia.indiatimes.com", country_code="IN",
         coverage_region="domestic", language="en", feed_timezone="Asia/Kolkata", adapter="timesofindia",
         rss_url="https://timesofindia.indiatimes.com/rssfeedstopstories.cms"),
    dict(name="The Indian Express", domain="indianexpress.com", country_code="IN",
         coverage_region="domestic", language="en", feed_timezone="Asia/Kolkata", adapter="generic",
         rss_url="https://indianexpress.com/feed/"),
    dict(name="BBC News", domain="bbc.com", country_code="GB", coverage_region="global",
         language="en", feed_timezone="UTC", adapter="generic",
         rss_url="http://feeds.bbci.co.uk/news/world/rss.xml"),
    dict(name="Al Jazeera English", domain="aljazeera.com", country_code="QA", coverage_region="global",
         language="en", feed_timezone="UTC", adapter="generic",
         rss_url="https://www.aljazeera.com/xml/rss/all.xml"),
    dict(name="Hindustan Times", domain="hindustantimes.com", country_code="IN",
         coverage_region="domestic", language="en", feed_timezone="Asia/Kolkata", adapter="generic",
         rss_url="https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml"),
    dict(name="NDTV", domain="ndtv.com", country_code="IN",
         coverage_region="domestic", language="en", feed_timezone="Asia/Kolkata", adapter="generic",
         rss_url="https://feeds.feedburner.com/ndtvnews-top-stories"),
    dict(name="LiveMint", domain="livemint.com", country_code="IN",
         coverage_region="domestic", language="en", feed_timezone="Asia/Kolkata", adapter="generic",
         rss_url="https://www.livemint.com/rss/news"),
    dict(name="Business Standard", domain="business-standard.com", country_code="IN",
         coverage_region="domestic", language="en", feed_timezone="Asia/Kolkata", adapter="generic",
         rss_url="https://www.business-standard.com/rss/latest.rss"),
    dict(name="The Economic Times", domain="economictimes.indiatimes.com", country_code="IN",
         coverage_region="domestic", language="en", feed_timezone="Asia/Kolkata", adapter="generic",
         rss_url="https://economictimes.indiatimes.com/rssfeedstopstories.cms"),
    dict(name="News18", domain="news18.com", country_code="IN",
         coverage_region="domestic", language="en", feed_timezone="Asia/Kolkata", adapter="generic",
         rss_url="https://www.news18.com/commonfeeds/v1/eng/rss/india.xml"),
]

INSERT_SQL = """
INSERT INTO sources (name, domain, country_code, coverage_region, language, feed_timezone, adapter, rss_url)
VALUES (%(name)s, %(domain)s, %(country_code)s, %(coverage_region)s, %(language)s, %(feed_timezone)s,
        %(adapter)s, %(rss_url)s)
ON CONFLICT (domain) DO NOTHING
"""


def seed(conn: psycopg.Connection) -> int:
    inserted = 0
    for source in SOURCES:
        with conn.transaction():
            cur = conn.execute(INSERT_SQL, source)
            inserted += cur.rowcount
    return inserted


def main() -> None:
    with psycopg.connect(db.DSN, autocommit=True) as conn:
        count = seed(conn)
    print(f"seeded {count} new source(s)")


if __name__ == "__main__":
    main()
