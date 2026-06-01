from django.urls import path

from .views import (
    ItemDetailView,
    ItemsView,
    ListDetailView,
    ListsView,
    TodoDetailView,
    TodosView,
)

# Mounted at api/ in config/urls.py — todos and notes share one module because
# they share one backing spreadsheet.
urlpatterns = [
    path("todos/", TodosView.as_view(), name="todos"),
    path("todos/<str:todo_id>", TodoDetailView.as_view(), name="todo-detail"),
    path("notes/lists", ListsView.as_view(), name="note-lists"),
    path("notes/lists/<str:list_id>", ListDetailView.as_view(), name="note-list-detail"),
    path("notes/items", ItemsView.as_view(), name="note-items"),
    path("notes/items/<str:item_id>", ItemDetailView.as_view(), name="note-item-detail"),
]
