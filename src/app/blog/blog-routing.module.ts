import { NgModule } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { RouterModule, Routes } from '@angular/router';
import { BlogComponent } from './components/blog/blog.component';
import { BlogPostComponent } from './components/blog-post/blog-post.component';

const routes: Routes = [
  {
    path: '',
    component: BlogComponent,
  },
  {
    path: ':slug',
    component: BlogPostComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BlogRoutingModule {}
