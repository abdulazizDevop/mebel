"""product/category slugs, slug history, order ad attribution

Revision ID: b1c2d3e4f5a6
Revises: 7c9d2e4f1a6b
Create Date: 2026-11-09 12:00:00.000000

Stage 1 of the SEO/ads work: pretty URLs need a `slug` on products and
categories (backfilled here from the current names), a `slug_history`
table so renamed items keep their old links alive, and UTM / click-id
columns on orders for the per-campaign report.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.services.slug import RESERVED_CATEGORY_SLUGS, make_unique, slugify


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = '7c9d2e4f1a6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _backfill(table: str, fallback: str, reserved: frozenset[str]) -> None:
    """Give every existing row a unique slug derived from its name.

    Runs in Python so SQLite (dev) and Postgres (prod) behave identically.
    Oldest rows get the clean slug; later duplicates get `-2`, `-3`, …
    """
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(f"SELECT id, name FROM {table} ORDER BY created_at, id")
    ).fetchall()
    taken: set[str] = set(reserved)
    for row_id, name in rows:
        base = slugify(name or "", fallback=fallback)
        slug = make_unique(base, taken.__contains__)
        taken.add(slug)
        bind.execute(
            sa.text(f"UPDATE {table} SET slug = :slug WHERE id = :id"),
            {"slug": slug, "id": row_id},
        )


def upgrade() -> None:
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.add_column(sa.Column('slug', sa.String(length=96), nullable=True))
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.add_column(sa.Column('slug', sa.String(length=96), nullable=True))

    _backfill('categories', 'razdel', RESERVED_CATEGORY_SLUGS)
    _backfill('products', 'tovar', frozenset())

    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_categories_slug'), ['slug'], unique=True)
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_products_slug'), ['slug'], unique=True)

    op.create_table(
        'slug_history',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('entity', sa.String(length=16), nullable=False),
        sa.Column('slug', sa.String(length=96), nullable=False),
        sa.Column('target_id', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('entity', 'slug', name='uq_slug_history_entity_slug'),
    )
    with op.batch_alter_table('slug_history', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_slug_history_slug'), ['slug'], unique=False)
        batch_op.create_index(batch_op.f('ix_slug_history_target_id'), ['target_id'], unique=False)

    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('utm_source', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('utm_medium', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('utm_campaign', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('utm_content', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('utm_term', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('yclid', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('gclid', sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column('landing_page', sa.String(length=500), nullable=True))
        batch_op.create_index(batch_op.f('ix_orders_utm_source'), ['utm_source'], unique=False)
        batch_op.create_index(batch_op.f('ix_orders_utm_campaign'), ['utm_campaign'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_orders_utm_campaign'))
        batch_op.drop_index(batch_op.f('ix_orders_utm_source'))
        for col in ('landing_page', 'gclid', 'yclid', 'utm_term', 'utm_content',
                    'utm_campaign', 'utm_medium', 'utm_source'):
            batch_op.drop_column(col)

    with op.batch_alter_table('slug_history', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_slug_history_target_id'))
        batch_op.drop_index(batch_op.f('ix_slug_history_slug'))
    op.drop_table('slug_history')

    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_products_slug'))
        batch_op.drop_column('slug')
    with op.batch_alter_table('categories', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_categories_slug'))
        batch_op.drop_column('slug')
