"""Model provider abstraction for Anthropic, OpenAI, Google, and Vertex AI.

Each provider implements the same interface: send a conversation with tool
definitions and get back the model's response including any tool calls.

Vertex AI providers inherit from their direct-API counterparts and only
override _get_client() to use ADC-authenticated Vertex clients.
"""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from typing import Any

from .tools import ToolDef, get_all_tool_defs
from .types import Provider, ToolCall, Turn

# Default Vertex AI settings (can be overridden via environment variables)
VERTEX_PROJECT = os.environ.get("VERTEX_PROJECT", "legalplant-dev")
VERTEX_CLAUDE_REGION = os.environ.get("VERTEX_CLAUDE_REGION", "us-east5")
VERTEX_GEMINI_REGION = os.environ.get("VERTEX_GEMINI_REGION", "us-central1")


class ModelProvider(ABC):
    """Abstract base for model providers."""

    provider: Provider
    model: str

    @abstractmethod
    def send(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[ToolDef],
    ) -> Turn:
        """Send a conversation and return the model's response.

        Args:
            system_prompt: System-level instructions.
            messages: Conversation history in provider-native format.
            tools: Available tool definitions.

        Returns:
            Turn with content and any tool calls.
        """
        ...

    @abstractmethod
    def format_tool_result(self, tool_call_id: str, tool_name: str, result: str) -> dict[str, Any]:
        """Format a tool result message for the conversation history."""
        ...

    @abstractmethod
    def format_assistant_turn(self, turn: Turn) -> dict[str, Any]:
        """Format an assistant turn for the conversation history."""
        ...


# ---------------------------------------------------------------------------
# Anthropic
# ---------------------------------------------------------------------------


class AnthropicProvider(ModelProvider):
    provider = Provider.ANTHROPIC

    def __init__(self, model: str = "claude-sonnet-4-20250514"):
        self.model = model
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        return self._client

    def send(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[ToolDef],
    ) -> Turn:
        client = self._get_client()
        tool_schemas = [t.to_anthropic_schema() for t in tools]

        response = client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
            tools=tool_schemas,
        )

        content_text = ""
        tool_calls = []

        for block in response.content:
            if block.type == "text":
                content_text += block.text
            elif block.type == "tool_use":
                tool_calls.append(ToolCall(
                    tool_name=block.name,
                    arguments=block.input,
                ))

        return Turn(
            content=content_text,
            tool_calls=tool_calls,
            raw={
                "id": response.id,
                "stop_reason": response.stop_reason,
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                },
            },
        )

    def format_tool_result(self, tool_call_id: str, tool_name: str, result: str) -> dict[str, Any]:
        return {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": tool_call_id,
                    "content": result,
                }
            ],
        }

    def format_assistant_turn(self, turn: Turn) -> dict[str, Any]:
        content = []
        if turn.content:
            content.append({"type": "text", "text": turn.content})
        for i, tc in enumerate(turn.tool_calls):
            content.append({
                "type": "tool_use",
                "id": f"toolu_{i:04d}",
                "name": tc.tool_name,
                "input": tc.arguments,
            })
        return {"role": "assistant", "content": content}


# ---------------------------------------------------------------------------
# OpenAI
# ---------------------------------------------------------------------------


class OpenAIProvider(ModelProvider):
    provider = Provider.OPENAI

    def __init__(self, model: str = "gpt-4o"):
        self.model = model
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            import openai
            self._client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
        return self._client

    def send(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[ToolDef],
    ) -> Turn:
        client = self._get_client()
        tool_schemas = [t.to_openai_schema() for t in tools]

        full_messages = [{"role": "system", "content": system_prompt}] + messages

        response = client.chat.completions.create(
            model=self.model,
            messages=full_messages,
            tools=tool_schemas,
            temperature=0,
        )

        choice = response.choices[0]
        msg = choice.message
        content_text = msg.content or ""
        tool_calls = []

        if msg.tool_calls:
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {"_raw": tc.function.arguments}
                tool_calls.append(ToolCall(
                    tool_name=tc.function.name,
                    arguments=args,
                ))

        return Turn(
            content=content_text,
            tool_calls=tool_calls,
            raw={
                "id": response.id,
                "finish_reason": choice.finish_reason,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                } if response.usage else None,
            },
        )

    def format_tool_result(self, tool_call_id: str, tool_name: str, result: str) -> dict[str, Any]:
        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": result,
        }

    def format_assistant_turn(self, turn: Turn) -> dict[str, Any]:
        msg: dict[str, Any] = {"role": "assistant", "content": turn.content or None}
        if turn.tool_calls:
            msg["tool_calls"] = [
                {
                    "id": f"call_{i:04d}",
                    "type": "function",
                    "function": {
                        "name": tc.tool_name,
                        "arguments": json.dumps(tc.arguments),
                    },
                }
                for i, tc in enumerate(turn.tool_calls)
            ]
        return msg


# ---------------------------------------------------------------------------
# Google Gemini
# ---------------------------------------------------------------------------


class GoogleProvider(ModelProvider):
    provider = Provider.GOOGLE

    def __init__(self, model: str = "gemini-2.5-pro"):
        self.model = model
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
        return self._client

    def send(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[ToolDef],
    ) -> Turn:
        client = self._get_client()
        from google.genai import types

        # Build tool declarations
        func_decls = []
        for t in tools:
            props = {}
            required = []
            for p in t.parameters:
                props[p.name] = types.Schema(
                    type=types.Type.STRING,
                    description=p.description,
                )
                if p.required:
                    required.append(p.name)
            func_decls.append(types.FunctionDeclaration(
                name=t.name,
                description=t.description,
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties=props,
                    required=required if required else None,
                ),
            ))

        google_tools = [types.Tool(function_declarations=func_decls)] if func_decls else None

        # Build contents from messages
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            if isinstance(msg.get("content"), str):
                contents.append(types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg["content"])],
                ))
            elif msg["role"] == "tool_result":
                # Gemini uses function_response parts
                contents.append(types.Content(
                    role="user",
                    parts=[types.Part.from_function_response(
                        name=msg["tool_name"],
                        response={"result": msg["content"]},
                    )],
                ))

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=google_tools if google_tools else None,
            temperature=0,
        )

        response = client.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )

        content_text = ""
        tool_calls = []

        if response.candidates and response.candidates[0].content:
            for part in response.candidates[0].content.parts:
                if part.text:
                    content_text += part.text
                elif part.function_call:
                    tool_calls.append(ToolCall(
                        tool_name=part.function_call.name,
                        arguments=dict(part.function_call.args) if part.function_call.args else {},
                    ))

        return Turn(
            content=content_text,
            tool_calls=tool_calls,
            raw={
                "usage": {
                    "prompt_tokens": (getattr(response.usage_metadata, "prompt_token_count", 0) or 0) if response.usage_metadata else 0,
                    "completion_tokens": (getattr(response.usage_metadata, "candidates_token_count", 0) or 0) if response.usage_metadata else 0,
                },
            },
        )

    def format_tool_result(self, tool_call_id: str, tool_name: str, result: str) -> dict[str, Any]:
        return {
            "role": "tool_result",
            "tool_name": tool_name,
            "content": result,
        }

    def format_assistant_turn(self, turn: Turn) -> dict[str, Any]:
        # Simplified — agent_loop handles the actual Gemini content building
        return {"role": "assistant", "content": turn.content}


# ---------------------------------------------------------------------------
# Vertex AI — Claude (Anthropic partner model via Vertex)
# ---------------------------------------------------------------------------


class VertexAnthropicProvider(AnthropicProvider):
    """Claude on Vertex AI. Inherits all message formatting from AnthropicProvider.

    Uses google-cloud ADC authentication instead of ANTHROPIC_API_KEY.
    Default model: Claude Opus 4.6 (most capable).
    """

    provider = Provider.VERTEX_CLAUDE

    def __init__(self, model: str = "claude-opus-4-6"):
        self.model = model
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            from anthropic import AnthropicVertex
            self._client = AnthropicVertex(
                region=VERTEX_CLAUDE_REGION,
                project_id=VERTEX_PROJECT,
            )
        return self._client


class VertexAnthropicSonnetProvider(VertexAnthropicProvider):
    """Claude Sonnet 4.6 on Vertex AI."""

    provider = Provider.VERTEX_CLAUDE_SONNET

    def __init__(self, model: str = "claude-sonnet-4-6"):
        self.model = model
        self._client: Any = None


# ---------------------------------------------------------------------------
# Vertex AI — Gemini (native Google model via Vertex)
# ---------------------------------------------------------------------------


class VertexGoogleProvider(GoogleProvider):
    """Gemini on Vertex AI. Inherits all message formatting from GoogleProvider.

    Uses google-cloud ADC authentication instead of GOOGLE_API_KEY.
    Default model: Gemini 2.5 Pro on regional endpoint.
    """

    provider = Provider.VERTEX_GEMINI

    def __init__(self, model: str = "gemini-2.5-pro"):
        self.model = model
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            from google import genai
            self._client = genai.Client(
                vertexai=True,
                project=VERTEX_PROJECT,
                location=VERTEX_GEMINI_REGION,
            )
        return self._client


class VertexGoogleGlobalProvider(GoogleProvider):
    """Gemini 3+ models on Vertex AI via the global endpoint.

    Newer Gemini models (3 Pro, 3.1 Pro) are only available on the
    global region, not regional endpoints like us-central1.
    """

    def __init__(self, model: str = "gemini-3-pro-preview", provider_enum: Provider = Provider.VERTEX_GEMINI_3_PRO):
        self.model = model
        self.provider = provider_enum
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            from google import genai
            self._client = genai.Client(
                vertexai=True,
                project=VERTEX_PROJECT,
                location="global",
            )
        return self._client


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

PROVIDER_MAP: dict[str, type[ModelProvider]] = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "google": GoogleProvider,
    "vertex-claude": VertexAnthropicProvider,
    "vertex-claude-sonnet": VertexAnthropicSonnetProvider,
    "vertex-gemini": VertexGoogleProvider,
    "vertex-gemini-3-pro": VertexGoogleGlobalProvider,
    "vertex-gemini-3.1-pro": VertexGoogleGlobalProvider,
}

DEFAULT_MODELS: dict[str, str] = {
    "anthropic": "claude-sonnet-4-20250514",
    "openai": "gpt-4o",
    "google": "gemini-2.5-pro",
    "vertex-claude": "claude-opus-4-6",
    "vertex-claude-sonnet": "claude-sonnet-4-6",
    "vertex-gemini": "gemini-2.5-pro",
    "vertex-gemini-3-pro": "gemini-3-pro-preview",
    "vertex-gemini-3.1-pro": "gemini-3.1-pro-preview",
}

# Provider enum overrides for providers that share a class
_PROVIDER_ENUM_OVERRIDES: dict[str, Provider] = {
    "vertex-gemini-3-pro": Provider.VERTEX_GEMINI_3_PRO,
    "vertex-gemini-3.1-pro": Provider.VERTEX_GEMINI_31_PRO,
}

# Providers that use Vertex AI ADC auth (no API key needed)
VERTEX_PROVIDERS = {
    "vertex-claude", "vertex-claude-sonnet",
    "vertex-gemini", "vertex-gemini-3-pro", "vertex-gemini-3.1-pro",
}


def create_provider(provider_name: str, model: str | None = None) -> ModelProvider:
    """Create a model provider by name.

    Args:
        provider_name: One of the keys in PROVIDER_MAP.
        model: Optional model override. Uses sensible default if not provided.
    """
    cls = PROVIDER_MAP.get(provider_name)
    if cls is None:
        raise ValueError(f"Unknown provider: {provider_name}. Available: {list(PROVIDER_MAP)}")

    resolved_model = model or DEFAULT_MODELS[provider_name]

    # VertexGoogleGlobalProvider needs a provider_enum kwarg
    if provider_name in _PROVIDER_ENUM_OVERRIDES:
        return cls(model=resolved_model, provider_enum=_PROVIDER_ENUM_OVERRIDES[provider_name])

    return cls(model=resolved_model)
