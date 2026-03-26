from rest_framework import serializers

from accounts.avatar_service import get_avatar_url
from .models import Comment


class CommentUserSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="pk")
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    email = serializers.EmailField()
    avatar_url = serializers.SerializerMethodField()

    def get_avatar_url(self, user):
        return get_avatar_url(user)


class ReplySerializer(serializers.ModelSerializer):
    created_by = CommentUserSerializer(read_only=True)
    is_own = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id", "body_md", "created_by", "is_own",
            "edited_at", "created_at", "updated_at",
        ]

    def get_is_own(self, obj):
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            return obj.created_by_id == request.user.id
        return False


class CommentSerializer(serializers.ModelSerializer):
    created_by = CommentUserSerializer(read_only=True)
    is_own = serializers.SerializerMethodField()
    replies = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = [
            "id", "body_md", "created_by", "is_own",
            "edited_at", "created_at", "updated_at", "replies",
        ]

    def get_is_own(self, obj):
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            return obj.created_by_id == request.user.id
        return False

    def get_replies(self, obj):
        # replies are prefetched and attached to the object in the view
        replies = getattr(obj, "_prefetched_replies", [])
        return ReplySerializer(
            replies, many=True, context=self.context,
        ).data


class CommentCreateSerializer(serializers.Serializer):
    body_md = serializers.CharField(max_length=10000)
