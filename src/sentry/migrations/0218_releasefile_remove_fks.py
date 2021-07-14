# Generated by Django 1.11.29 on 2021-07-05 07:56

from django.db import migrations

import sentry.db.models.fields.bounded


class Migration(migrations.Migration):
    # This flag is used to mark that a migration shouldn't be automatically run in
    # production. We set this to True for operations that we think are risky and want
    # someone from ops to run manually and monitor.
    # General advice is that if in doubt, mark your migration as `is_dangerous`.
    # Some things you should always mark as dangerous:
    # - Large data migrations. Typically we want these to be run manually by ops so that
    #   they can be monitored. Since data migrations will now hold a transaction open
    #   this is even more important.
    # - Adding columns to highly active tables, even ones that are NULL.
    is_dangerous = True

    # This flag is used to decide whether to run this migration in a transaction or not.
    # By default we prefer to run in a transaction, but for migrations where you want
    # to `CREATE INDEX CONCURRENTLY` this needs to be set to False. Typically you'll
    # want to create an index concurrently when adding one to an existing table.
    # You'll also usually want to set this to `False` if you're writing a data
    # migration, since we don't want the entire migration to run in one long-running
    # transaction.
    atomic = False

    dependencies = [
        ("sentry", "0217_debugfile_remove_project_fk"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.AlterField(
                    model_name="releasefile",
                    name="dist",
                    field=sentry.db.models.fields.foreignkey.FlexibleForeignKey(
                        db_constraint=False,
                        null=True,
                        to="sentry.Distribution",
                    ),
                ),
                migrations.AlterField(
                    model_name="releasefile",
                    name="organization",
                    field=sentry.db.models.fields.foreignkey.FlexibleForeignKey(
                        db_constraint=False,
                        to="sentry.Organization",
                    ),
                ),
                migrations.AlterField(
                    model_name="releasefile",
                    name="release",
                    field=sentry.db.models.fields.foreignkey.FlexibleForeignKey(
                        db_constraint=False,
                        to="sentry.Release",
                    ),
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="releasefile",
                    name="dist_id",
                    field=sentry.db.models.fields.bounded.BoundedBigIntegerField(null=True),
                ),
                migrations.AddField(
                    model_name="releasefile",
                    name="organization_id",
                    field=sentry.db.models.fields.bounded.BoundedBigIntegerField(),
                ),
                migrations.AddField(
                    model_name="releasefile",
                    name="release_id",
                    field=sentry.db.models.fields.bounded.BoundedBigIntegerField(),
                ),
                migrations.RemoveField(
                    model_name="releasefile",
                    name="dist",
                ),
                migrations.RemoveField(
                    model_name="releasefile",
                    name="organization",
                ),
                migrations.RemoveField(
                    model_name="releasefile",
                    name="release",
                ),
                migrations.AlterUniqueTogether(
                    name="releasefile",
                    unique_together={("release_id", "ident")},
                ),
                migrations.AlterIndexTogether(
                    name="releasefile",
                    index_together={("release_id", "name")},
                ),
            ],
        ),
    ]
