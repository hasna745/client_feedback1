"""create_client_form_assignments

Revision ID: c7d2f91a6e33
Revises: b4f8c8d9a1b2
Create Date: 2026-05-14 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7d2f91a6e33"
down_revision: Union[str, Sequence[str], None] = "b4f8c8d9a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "client_form_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("form_id", sa.Integer(), nullable=False),
        sa.Column("client_contact_id", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["client_contact_id"], ["client_contacts.id"]),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["form_id"], ["forms.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "form_id",
            "client_contact_id",
            name="uq_client_form_assignments_form_contact",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("client_form_assignments")
