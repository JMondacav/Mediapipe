from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RegisterView,
    LoginView,
    LogoutView,
    MeView,
    SessionViewSet,
    TranslationViewSet,
    FeedbackViewSet,
    stats,
    predict_sign,   # NUEVO
)

router = DefaultRouter()
router.register(r"sessions", SessionViewSet, basename="sessions")
router.register(r"translations", TranslationViewSet, basename="translations")
router.register(r"feedback", FeedbackViewSet, basename="feedback")

urlpatterns = [
    path("", include(router.urls)),
    path("auth/register/", RegisterView.as_view()),
    path("auth/login/", LoginView.as_view()),
    path("auth/logout/", LogoutView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("stats/", stats),
    path("predict/", predict_sign),   # NUEVO: POST /api/predict/
]
