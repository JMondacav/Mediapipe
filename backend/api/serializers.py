from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Session, Translation, Feedback


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"]
        )


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email"]


class SessionSerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source="user.username")

    class Meta:
        model = Session
        fields = "__all__"
        read_only_fields = ["user"]


class TranslationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Translation
        fields = "__all__"


class FeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feedback
        fields = "__all__"