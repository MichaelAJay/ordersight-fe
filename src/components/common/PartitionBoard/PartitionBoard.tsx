import { useMemo, type ComponentProps } from 'react';
import { clsx } from 'clsx';
import { DropZone, isTextDropItem } from 'react-aria-components';
import { useDrag } from 'react-aria';
import styles from './PartitionBoard.module.css';

const PARTITION_DRAG_TYPE = 'application/x-ordersight-partition-item';

type DragPayload = {
  item_id: string;
  bucket_id: string;
};

export type PartitionBoardBucket = {
  id: string;
  label: string;
  emptyLabel?: string;
};

export type PartitionBoardItem = {
  id: string;
  bucketId: string;
  title: string;
  subtitle?: string;
};

export type PartitionBoardProps = {
  buckets: PartitionBoardBucket[];
  items: PartitionBoardItem[];
  onMoveItem?: (itemId: string, toBucketId: string) => void;
  onItemPress?: (itemId: string) => void;
  activeItemId?: string;
  className?: string;
};

function encodeDragPayload(payload: DragPayload): string {
  return JSON.stringify(payload);
}

function decodeDragPayload(raw: string): DragPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DragPayload>;
    if (
      !parsed ||
      typeof parsed.item_id !== 'string' ||
      parsed.item_id.trim() === '' ||
      typeof parsed.bucket_id !== 'string' ||
      parsed.bucket_id.trim() === ''
    ) {
      return null;
    }
    return {
      item_id: parsed.item_id,
      bucket_id: parsed.bucket_id,
    };
  } catch {
    return null;
  }
}

type DraggablePartitionItemProps = {
  item: PartitionBoardItem;
  isActive: boolean;
  onItemPress?: (itemId: string) => void;
};

function DraggablePartitionItem({ item, isActive, onItemPress }: DraggablePartitionItemProps) {
  const { dragProps, isDragging } = useDrag({
    getItems() {
      return [
        {
          [PARTITION_DRAG_TYPE]: encodeDragPayload({
            item_id: item.id,
            bucket_id: item.bucketId,
          }),
          'text/plain': item.title,
        },
      ];
    },
    getAllowedDropOperations() {
      return ['move'];
    },
  });

  return (
    <button
      type="button"
      {...dragProps}
      className={clsx(styles.item, isActive && styles.itemActive)}
      data-dragging={isDragging}
      onClick={() => onItemPress?.(item.id)}
      aria-label={item.subtitle ? `${item.title}, ${item.subtitle}` : item.title}
    >
      <span className={styles.itemTitle}>{item.title}</span>
      {item.subtitle ? <span className={styles.itemSubtitle}>{item.subtitle}</span> : null}
    </button>
  );
}

export function PartitionBoard({
  buckets,
  items,
  onMoveItem,
  onItemPress,
  activeItemId,
  className,
}: PartitionBoardProps) {
  const itemsByBucket = useMemo(() => {
    const map = new Map<string, PartitionBoardItem[]>();
    for (const bucket of buckets) {
      map.set(bucket.id, []);
    }
    for (const item of items) {
      const bucketItems = map.get(item.bucketId);
      if (!bucketItems) {
        continue;
      }
      bucketItems.push(item);
    }
    return map;
  }, [buckets, items]);

  const handleBucketDrop = async (
    bucketId: string,
    event: Parameters<NonNullable<ComponentProps<typeof DropZone>['onDrop']>>[0],
  ) => {
    if (!onMoveItem) {
      return;
    }

    for (const item of event.items) {
      if (!isTextDropItem(item) || !item.types.has(PARTITION_DRAG_TYPE)) {
        continue;
      }

      const raw = await item.getText(PARTITION_DRAG_TYPE);
      const payload = decodeDragPayload(raw);
      if (!payload || payload.bucket_id === bucketId) {
        continue;
      }
      onMoveItem(payload.item_id, bucketId);
    }
  };

  return (
    <div className={clsx(styles.board, className)}>
      {buckets.map((bucket) => {
        const bucketItems = itemsByBucket.get(bucket.id) ?? [];
        return (
          <DropZone
            key={bucket.id}
            className={styles.bucket}
            aria-label={`${bucket.label} drop zone`}
            getDropOperation={(types, allowedOperations) => {
              if (
                types.has(PARTITION_DRAG_TYPE) &&
                allowedOperations.includes('move') &&
                onMoveItem
              ) {
                return 'move';
              }
              return 'cancel';
            }}
            onDrop={(event) => {
              void handleBucketDrop(bucket.id, event);
            }}
          >
            <p className={styles.bucketTitle}>
              {bucket.label} ({bucketItems.length})
            </p>

            {bucketItems.length === 0 ? (
              <p className={styles.empty}>{bucket.emptyLabel ?? 'None yet'}</p>
            ) : (
              <div className={styles.itemList}>
                {bucketItems.map((item) => (
                  <DraggablePartitionItem
                    key={item.id}
                    item={item}
                    isActive={activeItemId === item.id}
                    onItemPress={onItemPress}
                  />
                ))}
              </div>
            )}
          </DropZone>
        );
      })}
    </div>
  );
}
