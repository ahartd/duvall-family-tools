"""JSON API for todos and notes (gated by the shared secret-link token).

Routes (all under /api/):
  todos/                GET list · POST {title, due?}
  todos/<id>            PATCH {title?, due?, done?} · DELETE
  notes/lists           GET [?archived=1] · POST {title}
  notes/lists/<id>      PATCH {title?, archived?} · DELETE
  notes/items           POST {listId, text}
  notes/items/<id>      PATCH {text?, checked?} · DELETE
"""
from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from core.google_sheets import SheetsNotConfigured, SheetsUnavailable

from . import store


def _guard(fn):
    """Run a store call, mapping config/availability errors to HTTP responses."""
    try:
        return fn(), None
    except SheetsNotConfigured as exc:
        return None, Response({"detail": str(exc)}, status=503)
    except SheetsUnavailable:
        return None, Response({"detail": "Lists store temporarily unavailable."}, status=502)


def _str(data, key) -> str:
    value = data.get(key)
    return value.strip() if isinstance(value, str) else ""


class TodosView(APIView):
    def get(self, request):
        todos, err = _guard(store.list_todos)
        return err or Response({"todos": todos})

    def post(self, request):
        title = _str(request.data, "title")
        if not title:
            return Response({"detail": "A title is required."}, status=400)
        due = _str(request.data, "due")
        todo, err = _guard(lambda: store.add_todo(title, due))
        return err or Response(todo, status=201)


class TodoDetailView(APIView):
    def patch(self, request, todo_id):
        data = request.data
        kwargs = {}
        if "title" in data:
            kwargs["title"] = _str(data, "title")
        if "due" in data:
            kwargs["due"] = _str(data, "due")
        if "done" in data:
            kwargs["done"] = bool(data.get("done"))
        todo, err = _guard(lambda: store.update_todo(todo_id, **kwargs))
        if err:
            return err
        return Response(todo) if todo else Response({"detail": "Not found."}, status=404)

    def delete(self, request, todo_id):
        ok, err = _guard(lambda: store.delete_todo(todo_id))
        if err:
            return err
        return Response(status=204) if ok else Response({"detail": "Not found."}, status=404)


class ListsView(APIView):
    def get(self, request):
        include = request.query_params.get("archived") in ("1", "true", "yes")
        lists, err = _guard(lambda: store.list_notes(include_archived=include))
        return err or Response({"lists": lists})

    def post(self, request):
        title = _str(request.data, "title")
        if not title:
            return Response({"detail": "A title is required."}, status=400)
        lst, err = _guard(lambda: store.add_list(title))
        return err or Response(lst, status=201)


class ListDetailView(APIView):
    def patch(self, request, list_id):
        data = request.data
        kwargs = {}
        if "title" in data:
            kwargs["title"] = _str(data, "title")
        if "archived" in data:
            kwargs["archived"] = bool(data.get("archived"))
        lst, err = _guard(lambda: store.update_list(list_id, **kwargs))
        if err:
            return err
        return Response(lst) if lst else Response({"detail": "Not found."}, status=404)

    def delete(self, request, list_id):
        ok, err = _guard(lambda: store.delete_list(list_id))
        if err:
            return err
        return Response(status=204) if ok else Response({"detail": "Not found."}, status=404)


class ItemsView(APIView):
    def post(self, request):
        list_id = _str(request.data, "listId")
        text = _str(request.data, "text")
        if not list_id or not text:
            return Response({"detail": "listId and text are required."}, status=400)
        item, err = _guard(lambda: store.add_item(list_id, text))
        if err:
            return err
        return Response(item, status=201) if item else Response({"detail": "List not found."}, status=404)


class ItemDetailView(APIView):
    def patch(self, request, item_id):
        data = request.data
        kwargs = {}
        if "text" in data:
            kwargs["text"] = _str(data, "text")
        if "checked" in data:
            kwargs["checked"] = bool(data.get("checked"))
        item, err = _guard(lambda: store.update_item(item_id, **kwargs))
        if err:
            return err
        return Response(item) if item else Response({"detail": "Not found."}, status=404)

    def delete(self, request, item_id):
        ok, err = _guard(lambda: store.delete_item(item_id))
        if err:
            return err
        return Response(status=204) if ok else Response({"detail": "Not found."}, status=404)
