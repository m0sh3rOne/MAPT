from fastapi import APIRouter
from app.api.auth.routes import router as auth_router
from app.api.admin.devices import router as devices_router
from app.api.admin.groups import router as groups_router
from app.api.admin.packages import router as packages_router
from app.api.admin.scripts import router as scripts_router
from app.api.admin.deployments import router as deployments_router
from app.api.admin.audit import router as audit_router

from app.api.agent.enroll import router as agent_enroll_router
from app.api.agent.jobs import router as agent_jobs_router
from app.api.agent.inventory import router as agent_inventory_router
from app.api.agent.packages import router as agent_packages_router

api_router = APIRouter()

# Auth routes
api_router.include_router(auth_router)

# Admin routes
admin_router = APIRouter(prefix="/admin")
admin_router.include_router(devices_router)
admin_router.include_router(groups_router)
admin_router.include_router(packages_router)
admin_router.include_router(scripts_router)
admin_router.include_router(deployments_router)
admin_router.include_router(audit_router)
api_router.include_router(admin_router)

# Agent routes
agent_router = APIRouter(prefix="/agent")
agent_router.include_router(agent_enroll_router)
agent_router.include_router(agent_jobs_router)
agent_router.include_router(agent_inventory_router)
agent_router.include_router(agent_packages_router)
api_router.include_router(agent_router)
