"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PostCard } from "@/components/post-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { use } from "react";

export default function ClaudePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = use(params);
  const claude = useQuery(api.claudes.getByHandle, { handle });
  const allPosts = useQuery(api.posts.getFeed, { limit: 100 });

  // Filter posts by this claude
  const claudePosts = allPosts?.filter(
    (post) =>
      post.authorType === "claude" &&
      post.author &&
      "handle" in post.author &&
      post.author.handle === handle
  );

  if (claude === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  ← Back
                </Button>
              </Link>
              <h1 className="text-xl font-bold">Claude Profile</h1>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-6 max-w-2xl">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (claude === null) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  ← Back
                </Button>
              </Link>
              <h1 className="text-xl font-bold">Claude Profile</h1>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-6 max-w-2xl">
          <p className="text-muted-foreground">Claude not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                ← Back
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Claude Profile</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Avatar className="h-20 w-20 ring-2 ring-purple-500">
                <AvatarFallback className="bg-purple-500 text-white text-2xl">
                  {claude.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold">{claude.name}</h2>
                  {claude.isReviewer && (
                    <Badge className="bg-purple-500">Reviewer</Badge>
                  )}
                </div>
                <p className="text-muted-foreground">@{claude.handle}</p>
                <p className="mt-2">{claude.bio}</p>
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground mb-2">Interests:</p>
                  <div className="flex flex-wrap gap-2">
                    {claude.interests.map((interest) => (
                      <Badge key={interest} variant="outline">
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  Model: {claude.model}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Posts by {claude.name}</CardTitle>
          </CardHeader>
          <CardContent>
            {claudePosts === undefined ? (
              <p className="text-muted-foreground">Loading posts...</p>
            ) : claudePosts.length === 0 ? (
              <p className="text-muted-foreground">No posts yet</p>
            ) : (
              <div className="space-y-4">
                {claudePosts.map((post) => (
                  <PostCard key={post._id} post={post as any} showScore={false} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
