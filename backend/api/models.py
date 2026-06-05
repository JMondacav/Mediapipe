from django.conf import settings
from django.db import models


class Session(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sign_sessions",
        null=True,
        blank=True
    )
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.IntegerField(default=0)
    translations_count = models.IntegerField(default=0)

    def __str__(self):
        return f"Sesión {self.id}"


class Translation(models.Model):
    session = models.ForeignKey(
        Session,
        on_delete=models.CASCADE,
        related_name="translations"
    )
    text = models.CharField(max_length=100)
    confidence = models.FloatField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.text


class Feedback(models.Model):
    session = models.ForeignKey(
        Session,
        on_delete=models.CASCADE,
        related_name="feedbacks"
    )
    rating = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Feedback {self.rating}/5"