from fetch import rss

ADAPTER = {
    "host_aliases": {}, "extra_tracking_params": [], "keep_hashbang": True,
    "date_fields": ["published", "updated"], "title_cleanup": [],
    "excerpt_source": ["summary", "description", "content"], "max_items_per_run": 200,
}

def feed_xml(items_xml: str) -> bytes:
    return f"""<?xml version="1.0"?>
<rss version="2.0"><channel><title>Test Feed</title>
{items_xml}
</channel></rss>""".encode()

def test_missing_title_is_rejected():
    xml = feed_xml("<item><link>https://x.com/a</link><description>no title</description></item>")
    parsed = rss.parse_feed(xml, ADAPTER)
    assert parsed.items == []
    assert parsed.items_seen == 1
    assert parsed.items_rejected == 1

def test_valid_item_is_normalized_with_canonical_url():
    xml = feed_xml(
        "<item><title>Hello World</title><link>https://X.com/a?utm_source=t&amp;id=5</link>"
        "<description>Some &amp; excerpt</description>"
        "<pubDate>Mon, 06 Oct 2026 10:00:00 +0530</pubDate></item>"
    )
    parsed = rss.parse_feed(xml, ADAPTER)
    assert parsed.items_rejected == 0
    item = parsed.items[0]
    assert item.title == "Hello World"
    assert item.canonical_url == "x.com/a?id=5"
    assert item.canonicalization_version == "c1"
    assert item.excerpt == "Some & excerpt"
    assert item.published_at is not None

def test_html_is_stripped_from_title_and_excerpt():
    xml = feed_xml(
        "<item><title>Breaking &lt;b&gt;News&lt;/b&gt;</title><link>https://x.com/b</link>"
        "<description>&lt;p&gt;Body text&lt;/p&gt;</description></item>"
    )
    parsed = rss.parse_feed(xml, ADAPTER)
    item = parsed.items[0]
    assert item.title == "Breaking News"
    assert item.excerpt == "Body text"

def test_missing_date_counts_as_unparseable_but_item_kept():
    xml = feed_xml("<item><title>No Date Here</title><link>https://x.com/c</link></item>")
    parsed = rss.parse_feed(xml, ADAPTER)
    assert len(parsed.items) == 1
    assert parsed.items[0].published_at is None
    assert parsed.unparseable_dates == 1

def test_title_truncated_at_word_boundary_past_1000_chars():
    long_title = ("word " * 250).strip()  # 1249 chars
    xml = feed_xml(f"<item><title>{long_title}</title><link>https://x.com/d</link></item>")
    parsed = rss.parse_feed(xml, ADAPTER)
    assert len(parsed.items[0].title) <= 1000
    assert not parsed.items[0].title.endswith("wor")  # didn't cut mid-word

def test_http_image_url_is_dropped():
    xml = feed_xml(
        '<item><title>Img</title><link>https://x.com/e</link>'
        '<media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="http://x.com/pic.jpg"/></item>'
    )
    parsed = rss.parse_feed(xml, ADAPTER)
    assert parsed.items[0].image_url is None

def test_more_than_max_items_keeps_newest():
    items_xml = "\n".join(
        f"<item><title>Item {i}</title><link>https://x.com/{i}</link>"
        f"<pubDate>{'Mon, 06 Oct 2026 %02d:00:00 +0000' % (i % 24)}</pubDate></item>"
        for i in range(5)
    )
    adapter = {**ADAPTER, "max_items_per_run": 3}
    xml = feed_xml(items_xml)
    parsed = rss.parse_feed(xml, adapter)
    assert len(parsed.items) == 3
    # newest (highest hour) kept
    assert parsed.items[0].title == "Item 4"
