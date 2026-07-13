import { ShelfTabs } from "@/components/shelf/shelf-tabs";

export const metadata = {
  title: "书架 · English Reader",
};

export default function ShelfPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <ShelfTabs />
    </div>
  );
}
