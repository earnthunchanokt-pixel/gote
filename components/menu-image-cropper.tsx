"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MENU_IMAGE_SIZE, type MenuImageCrop } from "@/lib/pos-data";

type Selection = Omit<MenuImageCrop, "aspectRatio">;
type Handle = "move" | "nw" | "ne" | "sw" | "se";

const fullImage: Selection = { x: 0, y: 0, width: 1, height: 1 };
const minSide = 0.06;
const corners = [
  { handle: "nw", label: "มุมซ้ายบน", position: "left-0 top-0 cursor-nwse-resize" },
  { handle: "ne", label: "มุมขวาบน", position: "left-full top-0 cursor-nesw-resize" },
  { handle: "sw", label: "มุมซ้ายล่าง", position: "left-0 top-full cursor-nesw-resize" },
  { handle: "se", label: "มุมขวาล่าง", position: "left-full top-full cursor-nwse-resize" },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function adjustSelection(selection: Selection, handle: Handle, dx: number, dy: number): Selection {
  const { x, y, width, height } = selection;
  if (handle === "move") {
    return { x: clamp(x + dx, 0, 1 - width), y: clamp(y + dy, 0, 1 - height), width, height };
  }

  const right = x + width;
  const bottom = y + height;
  const minWidth = Math.min(width, minSide);
  const minHeight = Math.min(height, minSide);
  const left = handle.endsWith("w") ? clamp(x + dx, 0, right - minWidth) : x;
  const top = handle.startsWith("n") ? clamp(y + dy, 0, bottom - minHeight) : y;
  const nextRight = handle.endsWith("e") ? clamp(right + dx, x + minWidth, 1) : right;
  const nextBottom = handle.startsWith("s") ? clamp(bottom + dy, y + minHeight, 1) : bottom;
  return { x: left, y: top, width: nextRight - left, height: nextBottom - top };
}

export function MenuPhoto({ image, size = MENU_IMAGE_SIZE.initial, crop }: {
  image: string;
  size?: number;
  crop?: MenuImageCrop | null;
}) {
  if (!crop) {
    return (
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="aspect-square h-auto max-w-full shrink-0 rounded-md bg-[var(--surface-soft)] object-contain"
      />
    );
  }

  return (
    <span
      className="relative block max-w-full shrink-0 overflow-hidden rounded-md bg-[var(--surface-soft)]"
      style={{ width: size * Math.min(1, crop.aspectRatio), aspectRatio: crop.aspectRatio }}
    >
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="absolute max-w-none"
        style={{
          left: `${-100 * crop.x / crop.width}%`,
          top: `${-100 * crop.y / crop.height}%`,
          width: `${100 / crop.width}%`,
          height: `${100 / crop.height}%`,
        }}
      />
    </span>
  );
}

export function MenuImageCropper({ image, crop, onSave, onClose }: {
  image: string;
  crop?: MenuImageCrop | null;
  onSave: (crop: MenuImageCrop | null) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; pointerId: number; x: number; y: number; selection: Selection } | null>(null);
  const [selection, setSelection] = useState<Selection>(crop ?? fullImage);
  const [imageRatio, setImageRatio] = useState(0);
  const selectionStyle = {
    left: `${selection.x * 100}%`,
    top: `${selection.y * 100}%`,
    width: `${selection.width * 100}%`,
    height: `${selection.height * 100}%`,
  };

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  function startDrag(event: PointerEvent<HTMLButtonElement>, handle: Handle) {
    if (event.button !== 0 || drag.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY, selection };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    const bounds = stage.current?.getBoundingClientRect();
    if (!start || start.pointerId !== event.pointerId || !bounds?.width || !bounds.height) return;
    setSelection(adjustSelection(start.selection, start.handle, (event.clientX - start.x) / bounds.width, (event.clientY - start.y) / bounds.height));
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function moveWithKeys(event: KeyboardEvent<HTMLButtonElement>, handle: Handle) {
    const directions: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.05 : 0.01;
    setSelection((current) => adjustSelection(current, handle, direction[0] * step, direction[1] * step));
  }

  function closeCrop() {
    dialog.current?.close();
    onClose();
  }

  function applyCrop() {
    const { x, y, width, height } = selection;
    const isFullImage = x === 0 && y === 0 && width === 1 && height === 1;
    onSave(isFullImage ? null : { x, y, width, height, aspectRatio: imageRatio * width / height });
    closeCrop();
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        closeCrop();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-4 text-[var(--text)] shadow-xl backdrop:bg-slate-950/55 sm:p-5"
    >
      <h2 id={titleId} className="text-xl font-extrabold">ครอปรูปเมนู</h2>
      <p className="mt-1 text-[13px] text-[var(--muted)]">ลากมุมเพื่อปรับขนาด หรือลากตรงกลางเพื่อเลื่อนกรอบไปที่แก้ว</p>
      <div className="my-3 grid justify-items-center rounded-lg bg-[var(--surface-soft)] p-4">
        <div
          ref={stage}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onLostPointerCapture={stopDrag}
          className="relative max-w-full select-none"
        >
          <Image
            src={image}
            alt="รูปสำหรับเลือกส่วนที่ต้องการ"
            width={560}
            height={560}
            unoptimized
            draggable={false}
            onLoad={(event) => setImageRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)}
            className="block h-auto max-h-[50dvh] w-auto max-w-full rounded-sm"
          />
          {imageRatio > 0 ? (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 overflow-hidden rounded-sm">
                <div className="absolute shadow-[0_0_0_999px_rgba(15,23,42,0.56)]" style={selectionStyle} />
              </div>
              <div className="absolute ring-2 ring-white" style={selectionStyle}>
                <button
                  type="button"
                  aria-label="เลื่อนกรอบ"
                  onPointerDown={(event) => startDrag(event, "move")}
                  onKeyDown={(event) => moveWithKeys(event, "move")}
                  className="pointer-events-auto absolute inset-0 cursor-move touch-none focus-visible:outline-2 focus-visible:outline-sky-500"
                />
                {corners.map(({ handle, label, position }) => (
                  <button
                    key={handle}
                    type="button"
                    aria-label={`ปรับ${label}ของกรอบ`}
                    onPointerDown={(event) => startDrag(event, handle)}
                    onKeyDown={(event) => moveWithKeys(event, handle)}
                    className={`pointer-events-auto absolute grid size-8 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center focus-visible:outline-2 focus-visible:outline-sky-500 ${position}`}
                  >
                    <span className="size-3.5 rounded-sm border-2 border-[var(--sky)] bg-white shadow-sm" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setSelection(fullImage)} className="min-h-11 px-2 text-[13px] font-semibold text-[var(--sky)]">
          คืนกรอบเต็มรูป
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={closeCrop} className="min-h-11 rounded-md border border-[var(--line)] px-3 text-[13px] font-semibold">
            ยกเลิก
          </button>
          <button type="button" disabled={!imageRatio} onClick={applyCrop} className="min-h-11 rounded-md bg-[var(--sky)] px-3 text-[13px] font-bold text-white disabled:opacity-50">
            ใช้กรอบนี้
          </button>
        </div>
      </div>
    </dialog>
  );
}
