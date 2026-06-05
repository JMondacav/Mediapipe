from django.contrib import admin
from .models import Session, Translation, Feedback


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "started_at", "duration_seconds", "translations_count")
    search_fields = ("user__username",)
    list_filter = ("started_at",)


@admin.register(Translation)
class TranslationAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "text", "confidence", "created_at")
    search_fields = ("text",)
    list_filter = ("created_at",)


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "rating", "created_at")
    list_filter = ("rating", "created_at")