"""consent logs + customers.marketing_allowed

Revision ID: 7c9d2e4f1a6b
Revises: e513810f9691
Create Date: 2026-09-06 01:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7c9d2e4f1a6b'
down_revision: Union[str, None] = 'e513810f9691'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'consent_logs',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('customer_id', sa.String(length=32), nullable=True),
        sa.Column('request_id', sa.String(length=64), nullable=True),
        sa.Column('consent_type', sa.String(length=32), nullable=False),
        sa.Column('document_version', sa.String(length=32), nullable=False),
        sa.Column('source_form', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('consent_logs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_consent_logs_customer_id'), ['customer_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_consent_logs_request_id'), ['request_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_consent_logs_consent_type'), ['consent_type'], unique=False)
        batch_op.create_index(batch_op.f('ix_consent_logs_created_at'), ['created_at'], unique=False)

    with op.batch_alter_table('customers', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('marketing_allowed', sa.Boolean(), server_default='0', nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table('customers', schema=None) as batch_op:
        batch_op.drop_column('marketing_allowed')

    with op.batch_alter_table('consent_logs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_consent_logs_created_at'))
        batch_op.drop_index(batch_op.f('ix_consent_logs_consent_type'))
        batch_op.drop_index(batch_op.f('ix_consent_logs_request_id'))
        batch_op.drop_index(batch_op.f('ix_consent_logs_customer_id'))
    op.drop_table('consent_logs')
