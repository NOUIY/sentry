import time
from functools import cached_property

import msgpack

from sentry.similarity.backends.redis import RedisScriptMinHashIndexBackend
from sentry.similarity.signatures import MinHashSignatureBuilder
from sentry.testutils.cases import TestCase
from sentry.utils import redis

signature_builder = MinHashSignatureBuilder(32, 0xFFFF)


class RedisScriptMinHashIndexBackendTestCase(TestCase):
    @cached_property
    def index(self):
        return RedisScriptMinHashIndexBackend(
            redis.clusters.get("default").get_local_client(0),
            "sim",
            signature_builder,
            16,
            60 * 60,
            12,
            10,
        )

    def test_export_import(self) -> None:
        self.index.record("example", "1", [("index", "hello world")])

        timestamp = int(time.time())
        result = self.index.export("example", [("index", 1)], timestamp=timestamp)
        assert len(result) == 1

        # Copy the data from key 1 to key 2.
        self.index.import_("example", [("index", 2, result[0])], timestamp=timestamp)

        r1 = msgpack.unpackb(self.index.export("example", [("index", 1)], timestamp=timestamp)[0])
        r2 = msgpack.unpackb(self.index.export("example", [("index", 2)], timestamp=timestamp)[0])
        assert r1[0] == r2[0]
        self.assertAlmostEqual(r1[1], r2[1], delta=10)  # cannot ensure exact TTL match

        # Copy the data again to key 2 (duplicating all of the data.)
        self.index.import_("example", [("index", 2, result[0])], timestamp=timestamp)

        result = self.index.export("example", [("index", 2)], timestamp=timestamp)
        assert len(result) == 1

    def test_basic(self) -> None:
        self.index.record("example", "1", [("index", "hello world")])
        self.index.record("example", "2", [("index", "hello world")])
        self.index.record("example", "3", [("index", "jello world")])
        self.index.record("example", "4", [("index", "yellow world"), ("index", "mellow world")])
        self.index.record("example", "5", [("index", "pizza world")])

        # comparison, without thresholding
        results = self.index.compare("example", "1", [("index", 0)])
        assert results[0] == ("1", [1.0])
        assert results[1] == ("2", [1.0])  # identical contents
        assert results[2][0] in ("3", "4")  # equidistant pairs, order doesn't really matter
        assert results[3][0] in ("3", "4")
        assert results[4][0] == "5"

        # comparison, low threshold
        results = self.index.compare("example", "1", [("index", 6)])
        assert len(results) == 4
        assert results[0] == ("1", [1.0])
        assert results[1] == ("2", [1.0])  # identical contents
        assert results[2][0] in ("3", "4")  # equidistant pairs, order doesn't really matter
        assert results[3][0] in ("3", "4")

        # comparison, high threshold (exact match)
        results = self.index.compare("example", "1", [("index", self.index.bands)])
        assert len(results) == 2
        assert results[0] == ("1", [1.0])
        assert results[1] == ("2", [1.0])  # identical contents

        # comparison, candidate limit (with lexicographical collision sort)
        results = self.index.compare("example", "1", [("index", 0)], limit=1)
        assert len(results) == 1
        assert results[0] == ("1", [1.0])

        # classification, without thresholding
        results = self.index.classify("example", [("index", 0, "hello world")])
        assert results[0:2] == [("1", [1.0]), ("2", [1.0])]
        assert results[2][0] in ("3", "4")  # equidistant pairs, order doesn't really matter
        assert results[3][0] in ("3", "4")
        assert results[4][0] == "5"

        # classification, low threshold
        results = self.index.classify("example", [("index", 6, "hello world")])
        assert len(results) == 4
        assert results[0] == ("1", [1.0])
        assert results[1] == ("2", [1.0])  # identical contents
        assert results[2][0] in ("3", "4")  # equidistant pairs, order doesn't really matter
        assert results[3][0] in ("3", "4")

        # classification, high threshold (exact match)
        results = self.index.classify("example", [("index", self.index.bands, "hello world")])
        assert len(results) == 2
        assert results[0] == ("1", [1.0])
        assert results[1] == ("2", [1.0])  # identical contents

        # classification, candidate limit (with lexicographical collision sort)
        results = self.index.classify("example", [("index", 0, "hello world")], limit=1)
        assert len(results) == 1
        assert results[0] == ("1", [1.0])

        self.index.delete("example", [("index", "3")])
        assert [key for key, _ in self.index.compare("example", "1", [("index", 0)])] == [
            "1",
            "2",
            "4",
            "5",
        ]

    def test_multiple_index(self) -> None:
        self.index.record("example", "1", [("index:a", "hello world"), ("index:b", "hello world")])
        self.index.record("example", "2", [("index:a", "hello world"), ("index:b", "hello world")])
        self.index.record("example", "3", [("index:a", "hello world"), ("index:b", "pizza world")])
        self.index.record("example", "4", [("index:a", "hello world")])
        self.index.record("example", "5", [("index:b", "hello world")])

        # comparison, without thresholding
        results = self.index.compare("example", "1", [("index:a", 0), ("index:b", 0)])
        assert len(results) == 5
        assert results[:2] == [("1", [1.0, 1.0]), ("2", [1.0, 1.0])]
        assert results[2][0] == "3"
        assert results[2][1][0] == 1.0
        assert results[3] == ("4", [1.0, 0.0])
        assert results[4] == ("5", [0.0, 1.0])

        # comparison, candidate limit (with lexicographical collision sort)
        results = self.index.compare("example", "1", [("index:a", 0), ("index:b", 0)], limit=4)
        assert len(results) == 4
        assert results[:2] == [("1", [1.0, 1.0]), ("2", [1.0, 1.0])]
        assert results[2][0] == "3"
        assert results[2][1][0] == 1.0
        assert results[3] == ("4", [1.0, 0.0])

        # classification, without thresholding
        results = self.index.classify(
            "example", [("index:a", 0, "hello world"), ("index:b", 0, "hello world")]
        )
        assert len(results) == 5
        assert results[:2] == [("1", [1.0, 1.0]), ("2", [1.0, 1.0])]
        assert results[2][0] == "3"
        assert results[2][1][0] == 1.0
        assert results[3] == ("4", [1.0, 0.0])
        assert results[4] == ("5", [0.0, 1.0])

        # classification, with thresholding (low)
        results = self.index.classify(
            "example",
            [
                ("index:a", self.index.bands, "pizza world"),  # no direct hits
                ("index:b", 8, "pizza world"),  # one direct hit
            ],
        )
        assert len(results) == 1
        assert results[0][0] == "3"
        # this should have a value since it's similar even thought it was not
        # considered as a candidate for this index
        assert results[0][1][0] > 0
        assert results[0][1][1] == 1.0

        # classification, with thresholding (high)
        results = self.index.classify(
            "example",
            [
                ("index:a", self.index.bands, "pizza world"),  # no direct hits
                ("index:b", self.index.bands, "hello world"),  # 3 direct hits
            ],
        )
        assert len(results) == 3
        assert results[0][0] == "1"  # tie btw first 2 items is broken by lex sort
        assert results[0][1][0] > 0
        assert results[0][1][1] == 1.0
        assert results[1][0] == "2"
        assert results[1][1][0] > 0
        assert results[1][1][1] == 1.0
        assert results[2] == ("5", [0.0, 1.0])

        # classification, candidate limit (with lexicographical collision sort)
        results = self.index.classify(
            "example", [("index:a", 0, "hello world"), ("index:b", 0, "hello world")], limit=4
        )
        assert len(results) == 4
        assert results[:2] == [("1", [1.0, 1.0]), ("2", [1.0, 1.0])]
        assert results[2][0] == "3"
        assert results[2][1][0] == 1.0
        assert results[3] == ("4", [1.0, 0.0])

        # empty query
        assert (
            self.index.classify("example", [("index:a", 0, "hello world"), ("index:b", 0, "")])
            == self.index.compare("example", "4", [("index:a", 0), ("index:b", 0)])
            == [("4", [1.0, None]), ("1", [1.0, 0.0]), ("2", [1.0, 0.0]), ("3", [1.0, 0.0])]
        )

    def test_merge(self) -> None:
        self.index.record("example", "1", [("index", ["foo", "bar"])])
        self.index.record("example", "2", [("index", ["baz"])])
        assert self.index.classify("example", [("index", 0, ["foo", "bar"])]) == [("1", [1.0])]

        self.index.merge("example", "1", [("index", "2")])
        assert self.index.classify("example", [("index", 0, ["foo", "bar"])]) == [("1", [0.5])]

        # merge into an empty key should act as a move
        self.index.merge("example", "2", [("index", "1")])
        assert self.index.classify("example", [("index", 0, ["foo", "bar"])]) == [("2", [0.5])]

    def test_flush_scoped(self) -> None:
        self.index.record("example", "1", [("index", ["foo", "bar"])])
        assert self.index.classify("example", [("index", 0, ["foo", "bar"])]) == [("1", [1.0])]

        self.index.flush("example", ["index"])
        assert self.index.classify("example", [("index", 0, ["foo", "bar"])]) == []

    def test_flush_unscoped(self) -> None:
        self.index.record("example", "1", [("index", ["foo", "bar"])])
        assert self.index.classify("example", [("index", 0, ["foo", "bar"])]) == [("1", [1.0])]

        self.index.flush("*", ["index"])
        assert self.index.classify("example", [("index", 0, ["foo", "bar"])]) == []
