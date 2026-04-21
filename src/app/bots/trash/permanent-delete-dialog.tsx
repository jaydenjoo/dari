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

import {
  permanentDeleteBotAction,
  type PermanentDeleteBotFormState,
} from "./actions";

/**
 * 봇 영구 삭제 typed confirmation 다이얼로그 (Epic B Task B-3, 휴지통 전용).
 *
 * UX:
 *   - 휴지통 카드의 "영구 삭제" 버튼 → 모달.
 *   - 봇 이름을 정확히 타이핑해야 활성화.
 *   - 서버(`permanentDeleteBotAction`) 는 Storage cleanup → DB DELETE (되돌릴 수 없음).
 *   - 취소/외부 클릭 시 입력값 초기화.
 *
 * 접근성: base-ui `Dialog.Root` 가 focus trap + Esc 닫힘 + overlay 클릭 닫힘 기본 제공.
 */
const initialState: PermanentDeleteBotFormState = {};

export default function PermanentDeleteDialog({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const boundAction = permanentDeleteBotAction.bind(null, slug);
  const [state, formAction] = useActionState<
    PermanentDeleteBotFormState,
    FormData
  >(boundAction, initialState);

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
          <Button
            variant="destructive"
            size="sm"
            data-testid="permanent-delete-trigger"
          />
        }
      >
        영구 삭제
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
            htmlFor={`confirmName-${slug}`}
            className="block text-sm leading-relaxed text-gray-700"
          >
            확인을 위해 봇 이름을 정확히 입력해 주세요:{" "}
            <strong className="font-semibold text-gray-900">{name}</strong>
          </label>
          <Input
            id={`confirmName-${slug}`}
            name="confirmName"
            placeholder={name}
            value={confirmValue}
            onChange={(e) => setConfirmValue(e.target.value)}
            autoComplete="off"
            autoFocus
            data-testid="permanent-delete-confirm-input"
          />

          {state.error && (
            <p
              role="alert"
              data-testid="permanent-delete-error"
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
      data-testid="permanent-delete-submit"
    >
      {pending ? "삭제 중..." : "영구 삭제"}
    </Button>
  );
}
