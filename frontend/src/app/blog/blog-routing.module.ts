import { NgModule } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { RouterModule, Routes } from '@angular/router';
import { BlogComponent } from './components/blog/blog.component';
import { BlogPostComponent } from './components/blog-post/blog-post.component';

const routes: Routes = [
  {
    path: '',
    component: BlogComponent,
    data: {
      seo: {
        title: 'Piano Methods, Études & Articles',
        description:
          'Digitized piano methods and études — Burgmüller, Czerny and more — plus articles on practice, sight reading and music theory.'
      }
    }
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
