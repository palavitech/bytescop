"""Job handler registry — maps (event_area, event_type) to handler classes."""

from job_processor.handlers.closure_execute import TenantPurgeHandler
from job_processor.handlers.static_analysis import StaticAnalysisHandler

HANDLER_REGISTRY: dict[tuple[str, str], type] = {
    ('tenant', 'closure_execute'): TenantPurgeHandler,
    ('malware_analysis', 'static_analysis'): StaticAnalysisHandler,
}


def get_handler(area: str, event_type: str):
    """Look up and instantiate the handler for the given event, or None."""
    cls = HANDLER_REGISTRY.get((area, event_type))
    if cls is None:
        return None
    return cls()
