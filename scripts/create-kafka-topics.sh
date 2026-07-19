#!/usr/bin/env bash
# Creates the analytics-events topic(s) with enough partitions to actually
# parallelize across worker replicas. Auto-created topics (which is what
# you get for free if you skip this) default to 1 partition, which caps
# you at one active consumer no matter how many worker replicas you run.
#
# Usage: ./scripts/create-kafka-topics.sh [broker] [partitions]
set -euo pipefail

BROKER="${1:-localhost:9092}"
PARTITIONS="${2:-6}"

echo "Creating topics on ${BROKER} with ${PARTITIONS} partitions..."

docker run --rm --network host bitnami/kafka:3.7 kafka-topics.sh \
  --bootstrap-server "${BROKER}" \
  --create --if-not-exists \
  --topic analytics-events \
  --partitions "${PARTITIONS}" \
  --replication-factor 1 \
  --config retention.ms=604800000 # 7 days

docker run --rm --network host bitnami/kafka:3.7 kafka-topics.sh \
  --bootstrap-server "${BROKER}" \
  --create --if-not-exists \
  --topic analytics-events-dlq \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=2592000000 # 30 days, DLQ gets more time for investigation

echo "Done. Verify with:"
echo "  docker run --rm --network host bitnami/kafka:3.7 kafka-topics.sh --bootstrap-server ${BROKER} --list"
