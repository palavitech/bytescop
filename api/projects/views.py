import logging

from django.db import transaction
from django.db.models import Count
from rest_framework import serializers as drf_serializers, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.base import AuditedModelViewSet
from authorization.permissions import TenantPermission
from engagements.models import Engagement, EngagementSetting, EngagementType, Sow
from subscriptions.guard import SubscriptionGuard
from .models import Project
from .serializers import (
    ProjectCreateSerializer,
    ProjectDetailSerializer,
    ProjectRefSerializer,
    ProjectSerializer,
)

logger = logging.getLogger('bytescop.projects')


class ProjectViewSet(AuditedModelViewSet):
    permission_classes = [IsAuthenticated, TenantPermission, SubscriptionGuard]
    serializer_class = ProjectSerializer
    audit_resource_type = 'project'

    subscription_limits = {
        'create': {
            'rule': 'projects_per_tenant',
            'context': lambda view, request: {},
        },
    }

    required_permissions = {
        'list': ['project.view'],
        'retrieve': ['project.view'],
        'create': ['project.create'],
        'update': ['project.update'],
        'partial_update': ['project.update'],
        'destroy': ['project.delete'],
        'ref': ['project.view'],
        'add_engagement': ['project.update'],
    }

    def get_serializer_class(self):
        if self.action == 'create':
            return ProjectCreateSerializer
        if self.action == 'retrieve':
            return ProjectDetailSerializer
        return ProjectSerializer

    def get_queryset(self):
        from authorization.scoping import scope_projects
        qs = Project.objects.filter(
            tenant=self.request.tenant,
        ).select_related('client').order_by('-created_at')

        qs = scope_projects(qs, self.request)

        if self.action == 'list':
            qs = qs.annotate(_engagement_count=Count('engagements'))

            client_id = self.request.query_params.get('client')
            if client_id:
                qs = qs.filter(client_id=client_id)

            status_filter = self.request.query_params.get('status')
            if status_filter:
                qs = qs.filter(status=status_filter)

        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        engagement_types = serializer.validated_data.pop('engagement_types')
        client = serializer.validated_data.get('client')

        project = serializer.save(
            tenant=self.request.tenant,
            created_by=self.request.user,
            client_name=client.name if client else '',
        )

        for eng_type in engagement_types:
            type_label = EngagementType(eng_type).label
            eng_name = f'{project.client_name or project.name} - {type_label}'

            engagement = Engagement.objects.create(
                tenant=self.request.tenant,
                project=project,
                name=eng_name,
                engagement_type=eng_type,
                client=project.client,
                client_name=project.client_name,
                status='planned',
                start_date=project.start_date,
                end_date=project.end_date,
                created_by=self.request.user,
            )
            Sow.objects.create(
                engagement=engagement,
                title=f'{engagement.name} - Statement of Work',
            )
            EngagementSetting.objects.create(
                engagement=engagement,
                key='show_contact_info_on_report',
                value='true',
                updated_by=self.request.user,
            )

        logger.info(
            'Project created id=%s engagements=%d user=%s tenant=%s',
            project.pk, len(engagement_types),
            self.request.user.pk, self.request.tenant.slug,
        )

    def perform_update(self, serializer):
        project = serializer.save()
        logger.info(
            'Project updated id=%s user=%s tenant=%s',
            project.pk, self.request.user.pk, self.request.tenant.slug,
        )

    def perform_destroy(self, instance):
        pid = instance.pk
        instance.delete()
        logger.info(
            'Project deleted id=%s user=%s tenant=%s',
            pid, self.request.user.pk, self.request.tenant.slug,
        )

    @action(detail=False, methods=['get'])
    def ref(self, request):
        qs = self.get_queryset()
        serializer = ProjectRefSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='add-engagement')
    @transaction.atomic
    def add_engagement(self, request, pk=None):
        project = self.get_object()
        eng_type = request.data.get('engagement_type')

        if not eng_type:
            return Response(
                {'detail': 'engagement_type is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        valid_types = [c[0] for c in EngagementType.choices]
        if eng_type not in valid_types:
            return Response(
                {'detail': f'Invalid engagement type: {eng_type}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        type_label = EngagementType(eng_type).label
        eng_name = f'{project.client_name or project.name} - {type_label}'

        engagement = Engagement.objects.create(
            tenant=request.tenant,
            project=project,
            name=eng_name,
            engagement_type=eng_type,
            client=project.client,
            client_name=project.client_name,
            status='planned',
            start_date=project.start_date,
            end_date=project.end_date,
            created_by=request.user,
        )
        Sow.objects.create(
            engagement=engagement,
            title=f'{engagement.name} - Statement of Work',
        )
        EngagementSetting.objects.create(
            engagement=engagement,
            key='show_contact_info_on_report',
            value='true',
            updated_by=request.user,
        )

        logger.info(
            'Engagement added to project id=%s engagement=%s user=%s tenant=%s',
            project.pk, engagement.pk,
            request.user.pk, request.tenant.slug,
        )

        from engagements.serializers import EngagementSerializer
        return Response(
            EngagementSerializer(engagement).data,
            status=status.HTTP_201_CREATED,
        )
