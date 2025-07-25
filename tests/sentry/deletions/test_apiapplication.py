from sentry.deletions.models.scheduleddeletion import ScheduledDeletion
from sentry.deletions.tasks.hybrid_cloud import schedule_hybrid_cloud_foreign_key_jobs
from sentry.deletions.tasks.scheduled import run_scheduled_deletions_control
from sentry.models.apiapplication import ApiApplication, ApiApplicationStatus
from sentry.models.apigrant import ApiGrant
from sentry.models.apitoken import ApiToken
from sentry.sentry_apps.models.servicehook import ServiceHook
from sentry.silo.base import SiloMode
from sentry.testutils.cases import TransactionTestCase
from sentry.testutils.hybrid_cloud import HybridCloudTestMixin
from sentry.testutils.outbox import outbox_runner
from sentry.testutils.silo import assume_test_silo_mode, control_silo_test


@control_silo_test
class DeleteApiApplicationTest(TransactionTestCase, HybridCloudTestMixin):
    def test_simple(self) -> None:
        app = ApiApplication.objects.create(
            owner=self.user, status=ApiApplicationStatus.pending_deletion
        )
        ApiToken.objects.create(application=app, user=self.user, scopes=0)
        ApiGrant.objects.create(
            application=app, user=self.user, scopes=0, redirect_uri="http://example.com"
        )
        service_hook = self.create_service_hook(application=app)
        sh_id = service_hook.id

        ScheduledDeletion.schedule(instance=app, days=0)

        with self.tasks(), outbox_runner():
            run_scheduled_deletions_control()

        assert not ApiApplication.objects.filter(id=app.id).exists()
        assert not ApiGrant.objects.filter(application=app).exists()
        assert not ApiToken.objects.filter(application=app).exists()
        with assume_test_silo_mode(SiloMode.REGION):
            assert ServiceHook.objects.filter(id=sh_id).exists()

        with self.tasks(), assume_test_silo_mode(SiloMode.REGION):
            schedule_hybrid_cloud_foreign_key_jobs()
            assert not ServiceHook.objects.filter(id=sh_id).exists()

    def test_skip_active(self) -> None:
        app = ApiApplication.objects.create(owner=self.user, status=ApiApplicationStatus.active)
        ApiToken.objects.create(application=app, user=self.user, scopes=0)
        ApiGrant.objects.create(
            application=app, user=self.user, scopes=0, redirect_uri="http://example.com"
        )

        ScheduledDeletion.schedule(instance=app, days=0)

        with self.tasks(), outbox_runner():
            run_scheduled_deletions_control()

        assert ApiApplication.objects.filter(id=app.id).exists()
        assert ApiGrant.objects.filter(application=app).exists()
        assert ApiToken.objects.filter(application=app).exists()
