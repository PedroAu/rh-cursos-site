import { AdminBlogEditPage } from "@/features/admin/blog/admin-blog-editor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminBlogEditPage postId={id} />;
}
