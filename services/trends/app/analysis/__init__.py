"""Analysis package — scoring, lifecycle, correlation, sentiment, vertical, embeddings.

All functions are pure Python (no I/O) so they're trivially unit-testable.
The ML models (BART-MNLI, detoxify, sentence-transformers) are lazy-loaded
on first call and cached at module level.
"""
