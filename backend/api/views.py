from django.contrib.auth import authenticate
from rest_framework import viewsets, status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Session, Translation, Feedback
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    SessionSerializer,
    TranslationSerializer,
    FeedbackSerializer,
)


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)

        if serializer.is_valid():
            user = serializer.save()
            token, _ = Token.objects.get_or_create(user=user)

            return Response({
                "user": UserSerializer(user).data,
                "token": token.key
            }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")

        user = authenticate(username=username, password=password)

        if not user:
            return Response({
                "error": "Credenciales incorrectas"
            }, status=status.HTTP_400_BAD_REQUEST)

        token, _ = Token.objects.get_or_create(user=user)

        return Response({
            "user": UserSerializer(user).data,
            "token": token.key
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response({"message": "Sesión cerrada correctamente"})


class SessionViewSet(viewsets.ModelViewSet):
    serializer_class = SessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Session.objects.filter(user=self.request.user).order_by("-started_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TranslationViewSet(viewsets.ModelViewSet):
    serializer_class = TranslationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Translation.objects.filter(
            session__user=self.request.user
        ).order_by("-created_at")


class FeedbackViewSet(viewsets.ModelViewSet):
    serializer_class = FeedbackSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Feedback.objects.filter(
            session__user=self.request.user
        ).order_by("-created_at")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def stats(request):
    sessions = Session.objects.filter(user=request.user)
    translations = Translation.objects.filter(session__user=request.user)
    feedbacks = Feedback.objects.filter(session__user=request.user)

    total_sessions = sessions.count()
    total_translations = translations.count()
    total_feedbacks = feedbacks.count()

    average_rating = 0

    if feedbacks.exists():
        average_rating = sum(f.rating for f in feedbacks) / total_feedbacks

    return Response({
        "total_sessions": total_sessions,
        "total_translations": total_translations,
        "total_feedbacks": total_feedbacks,
        "average_rating": round(average_rating, 2)
    })


# ─────────────────────────────────────────────
#  NUEVO ENDPOINT: Clasificación de señas con ML
# ─────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def predict_sign(request):
    """
    Recibe 63 coordenadas de landmarks y devuelve la seña predicha.

    Body JSON:
        { "landmarks": [x0, y0, z0, x1, y1, z1, ..., x20, y20, z20] }

    Respuesta:
        { "label": "A", "confidence": 0.97 }
    """
    from .ml_predictor import predict_landmarks

    landmarks = request.data.get("landmarks")

    if not landmarks or not isinstance(landmarks, list):
        return Response(
            {"error": "Se esperan los landmarks como lista en el campo 'landmarks'"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(landmarks) != 63:
        return Response(
            {"error": f"Se esperan 63 valores (21 puntos × 3), se recibieron {len(landmarks)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = predict_landmarks(landmarks)
        return Response(result)

    except FileNotFoundError as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    except Exception as e:
        return Response(
            {"error": f"Error en predicción: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
