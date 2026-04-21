"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { deleteBotAction, type DeleteBotFormState } from "./actions";

/**
 * 봇 영구 삭제 typed confirmation 다이얼로그 (Epic B Task B-1).
 *
 * UX:
 *   - 트리거 버튼 클릭 → 모달 오픈.
 *   - 사용자가 봇 이름을 정확히 타이핑해야 "영구 삭제" 버튼 활성화.
 *   - 활성화 상태는 **UX 힌트** — 서버(`deleteBotAction`) 에서도 재검증 (클라 우회 방어).
 *   - 취소 또는 모달 외부 클릭으로 닫으면 입력값 초기화.
 *
 * 접근성:
 *   - base-ui `Dialog.Root` 가 focus trap + Esc 닫힘 + overlay 클릭 닫힘 기본 제공.
 *   - input `autoFocus` — 모달 오픈 시 즉시 포커스.
 *
 * 주의: modal=true(기본)이라 DialogClose 를 Popup 내부에 두어 스크린리더 UX 보장
 *   (DialogContent 내부 DialogFooter 의 DialogClose 가 이 역할).
 */
const initialState: DeleteBotFormState = {};

export default function DeleteBotDialog({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const boundAction = deleteBotAction.bind(null, slug);
  const [state, formAction] = useActionState<DeleteBotFormState, FormData>(
    boundAction,
    initialState,
  );

  // 서버 재검증과 동일 규칙(trim 후 exact match) — UX-서버 일관성.
  // 서버는 trim 을 수행하므로 UI 도 trim 기반으로 판정해 오도된 "활성화됐는데 거부" 방지.
  const nameMatches = confirmValue.trim() === name;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setConfirmValue("");
      }}
    >
      <DialogTrigger
        render={
          <Button variant="destructive" data-testid="delete-bot-trigger" />
        }
      >
        봇 영구 삭제
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>봇을 영구 삭제할까요?</DialogTitle>
          <DialogDescription>
            이 작업은 되돌릴 수 없어요. 대화 기록, 지식 소스, 업로드한 파일이
            모두 함께 삭제됩니다.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-3">
          <label
            htmlFor="confirmName"
            className="block text-sm leading-relaxed text-gray-700"
          >
            확인을 위해 봇 이름을 정확히 입력해 주세요:{" "}
            <strong className="font-semibold text-gray-900">{name}</strong>
          </label>
          <Input
            id="confirmName"
            name="confirmName"
            placeholder={name}
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            autoComplete="off"
            autoFocus
            data-testid="delete-bot-confirm-input"
          />

          {state.error && (
            <p
              role="alert"
              data-testid="delete-bot-error"
              className="text-sm text-red-700"
            >
              {state.error}
            </p>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              취소
            </DialogClose>
            <SubmitButton disabled={!nameMatches} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="destructive"
      disabled={disabled || pending}
      data-testid="delete-bot-submit"
    >
      {pending ? "삭제 중..." : "영구 삭제"}
    </Button>
  );
}
